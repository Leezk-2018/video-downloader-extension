// ================================================================
// 视频下载器 Pro - Background Service Worker
// ================================================================

// ── 任务状态管理 ──────────────────────────────────────────────────
let currentTask = {
  active: false,
  platform: '',
  progress: 0,
  text: '',
  error: '',
  dlUrl: ''
};

// ── 工具函数 ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2
  });
}

function triggerDownload(url, filename) {
  console.log('[BG] triggerDownload:', url, filename);
  const options = { url };
  if (filename) options.filename = filename;
  
  chrome.downloads.download(options, id => {
    if (chrome.runtime.lastError) {
      console.error('[BG] 下载错误:', chrome.runtime.lastError.message);
    }
  });
}

function updateTask(data) {
  currentTask = { ...currentTask, ...data };
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', task: currentTask }).catch(() => {});
  chrome.tabs.query({ active: true }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'STATUS_UPDATE', task: currentTask }).catch(() => {});
    });
  });
}

// ── 消息监听 ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_YT_DOWNLOAD') {
    handleYouTubeDownload(message.videoId, message.formatCode);
    sendResponse({ ok: true });
  } else if (message.type === 'START_XHS_DOWNLOAD') {
    handleXhsDownload(message.urls, message.type_label);
    sendResponse({ ok: true });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ task: currentTask });
  } else if (message.type === 'EXEC_XHS_EXTRACT') {
    handleXhsExtract(sender.tab.id).then(sendResponse);
    return true; 
  }
  return true;
});

async function handleXhsExtract(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractXhsMedia,
      world: 'MAIN',
    });
    return res?.result;
  } catch (e) {
    return null;
  }
}

// 复用原本的小红书媒体提取逻辑
function extractXhsMedia() {
  const allImagesRaw = [];
  const allVideoLinks = [];
  let detectedCover = null;
  let noteType = 'normal';

  function addImage(url) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim().replace(/\\u002F/g, '/');
    if (cleanUrl.includes('!nd_prv')) detectedCover = cleanUrl;
    allImagesRaw.push(cleanUrl);
  }

  try {
    const dataRoot = window.__INITIAL_STATE__ || window.__pinia || null;
    if (dataRoot) {
      const noteIdMatch = location.pathname.match(/[/]explore[/]([a-f0-9]+)|[/]discovery[/]item[/]([a-f0-9]+)/i);
      const noteId = noteIdMatch ? (noteIdMatch[1] || noteIdMatch[2]) : null;
      let noteData = null;
      function findNote(obj, depth) {
        if (!obj || depth > 10 || typeof obj !== 'object' || noteData) return;
        if (obj.noteId === noteId || obj.id === noteId) { noteData = obj; return; }
        if (noteId && obj[noteId]) { noteData = obj[noteId]; return; }
        Object.values(obj).forEach(v => { if (v && typeof v === 'object') findNote(v, depth + 1); });
      }
      if (noteId) findNote(dataRoot, 0);
      const scope = noteData || null;
      if (scope) {
        if (scope.type === 'video') noteType = 'video';
        const seen = new WeakSet();
        function walk(obj, depth) {
          if (!obj || depth > 15 || (typeof obj === 'object' && seen.has(obj))) return;
          if (typeof obj === 'object') {
            seen.add(obj);
            if (obj.masterUrl) allVideoLinks.push({ url: obj.masterUrl, source: 'master' });
            if (obj.h265Url)   allVideoLinks.push({ url: obj.h265Url,   source: 'h265' });
            if (obj.h264Url)   allVideoLinks.push({ url: obj.h264Url,   source: 'h264' });
            if (Array.isArray(obj.backupUrls)) obj.backupUrls.forEach(u => allVideoLinks.push({ url: u, source: 'backup' }));
            if (obj.cover && typeof obj.cover === 'string') addImage(obj.cover);
          }
          if (typeof obj === 'string') {
            if (/sns-video|\.mp4/.test(obj)) allVideoLinks.push({ url: obj, source: 'string' });
            if (/sns-img|sns-webpcdn|ci\.xiaohongshu|sns-webpic/.test(obj)) addImage(obj);
            return;
          }
          if (Array.isArray(obj)) { obj.forEach(i => walk(i, depth + 1)); return; }
          ['imageScene', 'urlPre', 'urlDefault', 'infoList', 'imageList', 'imagesList', 'cover'].forEach(k => { if (obj[k]) walk(obj[k], depth + 1); });
          Object.values(obj).forEach(v => { if (v) walk(v, depth + 1); });
        }
        walk(scope, 0);
      }
    }
    if (allVideoLinks.length > 0) noteType = 'video';
  } catch (e) {}

  // 🌟 图片深度智能去重 🌟
  const finalImages = [];
  const idToBestUrl = new Map(); 

  allImagesRaw.forEach(url => {
    const basePath = url.split('?')[0].split('!')[0].split('@')[0];
    const fileId = basePath.split('/').pop();
    if (!fileId || fileId.length < 10) return;

    // 优先级判断：dft (资源) > 其他 > prv (预览)
    let priority = 1;
    if (url.includes('!nd_dft')) priority = 3;
    else if (url.includes('!nd_prv')) priority = 0; 

    const existing = idToBestUrl.get(fileId);
    if (!existing || priority > existing.priority) {
      idToBestUrl.set(fileId, { url: url.replace('http://', 'https://'), priority });
    }
  });

  idToBestUrl.forEach(val => finalImages.push(val.url));

  const uniqueVideos = [];
  const hashSeen = new Set();
  const cleanedList = allVideoLinks.map(item => {
    const url = item.url.trim().replace(/\\u002F/g, '/');
    const base = url.split('?')[0]; 
    const hasParams = url.includes('?');
    const hashMatch = base.match(/\/([a-z0-9]{30,})/i);
    const hash = hashMatch ? hashMatch[1] : base;
    const isWatermarked = base.includes('_259.mp4');
    let weight = 0;
    if (base.includes('_108.mp4'))      weight += 5000;
    else if (base.includes('_115.mp4')) weight += 4000;
    else if (base.includes('_114.mp4')) weight += 3000;
    if (base.includes('1080'))      weight += 2000;
    else if (base.includes('720'))  weight += 1000;
    const sourceWeights = { 'master': 500, 'h265': 400, 'h264': 300, 'backup': 200, 'string': 100, 'dom': 50 };
    weight += (sourceWeights[item.source] || 0);
    if (!hasParams) weight += 100;
    return { url: url.replace('http://', 'https://'), base, hash, hasParams, isWatermarked, weight };
  }).filter(item => item.base.startsWith('http'));

  cleanedList.sort((a, b) => b.weight - a.weight);
  for (const item of cleanedList) {
    if (!hashSeen.has(item.hash)) {
      hashSeen.add(item.hash);
      uniqueVideos.push({ url: item.url, isWatermarked: item.isWatermarked, weight: item.weight });
    }
  }

  return {
    videos: uniqueVideos, 
    noteType: noteType,
    cover: detectedCover,
    images: finalImages
  };
}

// ── YouTube 下载核心逻辑 ──────────────────────────────────────────
async function handleYouTubeDownload(videoId, formatCode) {
  if (currentTask.active) return;
  updateTask({ active: true, platform: 'youtube', progress: 15, text: '正在提交任务...', error: '', dlUrl: '' });

  try {
    const convertUrl = `https://loader.to/ajax/download.php?format=${formatCode}&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&timeStamp=${Date.now()}`;
    const r = await fetch(convertUrl, { headers: { Accept: 'application/json' } });
    const convertData = await r.json();
    const taskId = convertData?.id;
    if (!taskId) throw new Error('服务暂不可用');

    updateTask({ progress: 35, text: '视频转换中...' });
    const pollUrl = convertData.progress_url || `https://loader.to/ajax/progress.php?id=${taskId}`;
    let dlUrl = null;

    for (let i = 0; i < 300; i++) {
      await sleep(3000);
      let pd = await (await fetch(pollUrl)).json();
      const pct = Math.min(Math.round((parseInt(pd?.progress) || 0) / 10), 100);
      updateTask({ progress: 35 + Math.round(pct * 0.6), text: `转换中 ${pct}%...` });
      if (pd?.download_url || (pd?.success == 1 && (pd?.url || pd?.link))) {
        dlUrl = pd.download_url || pd.url || pd.link;
        break;
      }
      if (pd?.error) throw new Error('转换失败');
    }

    if (!dlUrl) throw new Error('转换超时');
    updateTask({ progress: 100, text: '✅ 转换完成' });
    triggerDownload(dlUrl);
    showNotification('下载开始', 'YouTube 视频已开始保存。');
    await sleep(5000);
    updateTask({ active: false });
  } catch (err) {
    updateTask({ active: false, error: err.message });
  }
}

// ── 小红书下载核心逻辑 ─────────────────────────────────────────────
async function handleXhsDownload(urls, typeLabel) {
  if (currentTask.active) return;
  updateTask({ active: true, platform: 'xhs', progress: 80, text: `准备下载 ${urls.length} 个${typeLabel}...`, error: '', dlUrl: '' });

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const ext = typeLabel === '图片' ? '.webp' : '.mp4';
      const filename = `xhs_${Date.now()}_${i+1}${ext}`;
      triggerDownload(url, filename);
      if (i < urls.length - 1) await sleep(800);
      updateTask({ progress: 80 + Math.round(((i + 1) / urls.length) * 20), text: `正在保存第 ${i + 1}/${urls.length} 个...` });
    }
    updateTask({ progress: 100, text: `✅ 下载已全部开始` });
    await sleep(5000);
    updateTask({ active: false });
  } catch (err) {
    updateTask({ active: false, error: err.message });
  }
}
