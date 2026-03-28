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

function triggerDownload(url) {
  console.log('[BG] triggerDownload:', url);
  chrome.downloads.download({ url }, id => {
    if (chrome.runtime.lastError) {
      console.error('[BG] 下载错误:', chrome.runtime.lastError.message);
    }
  });
}

function updateTask(data) {
  currentTask = { ...currentTask, ...data };
  // 向所有打开的 popup 和当前激活的 tab 发送状态更新
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
    return true; // 异步响应
  }
  return true;
});

async function handleXhsExtract(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractXhsMedia, // 复用原本逻辑
      world: 'MAIN',
    });
    return res?.result;
  } catch (e) {
    return null;
  }
}

// 复用原本的小红书媒体提取逻辑 (由于 content.js 无法直接访问 MAIN world，所以放在 BG 中触发)
function extractXhsMedia() {
  const images = [];
  const allVideoLinks = [];
  let detectedCover = null;

  function addImage(url) {
    if (!url || typeof url !== 'string') return;
    url = url.trim().replace(/\\u002F/g, '/');
    
    // 🌟 特征识别：识别小红书视频封面专项链接
    if (url.includes('sns-webpic') || url.includes('!nd_prv')) {
      detectedCover = url;
    }

    const clean = url.split('!')[0].split('@')[0];
    if (images.includes(clean)) return;
    images.push(clean);
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
        const seen = new WeakSet();
        function walk(obj, depth) {
          if (!obj || depth > 15 || (typeof obj === 'object' && seen.has(obj))) return;
          if (typeof obj === 'object') {
            seen.add(obj);
            if (obj.masterUrl) allVideoLinks.push(obj.masterUrl);
            if (obj.h265Url)   allVideoLinks.push(obj.h265Url);
            if (obj.h264Url)   allVideoLinks.push(obj.h264Url);
            if (Array.isArray(obj.backupUrls)) obj.backupUrls.forEach(u => allVideoLinks.push(u));
            // 尝试直接捕获可能存在的 cover 字段
            if (obj.cover && typeof obj.cover === 'string') addImage(obj.cover);
          }
          if (typeof obj === 'string') {
            if (/sns-video|\.mp4/.test(obj)) allVideoLinks.push(obj);
            if (/sns-img|sns-webpcdn|ci\.xiaohongshu|sns-webpic/.test(obj)) addImage(obj);
            return;
          }
          if (Array.isArray(obj)) { obj.forEach(i => walk(i, depth + 1)); return; }
          ['imageScene', 'urlPre', 'urlDefault', 'infoList', 'imageList', 'cover'].forEach(k => { if (obj[k]) walk(obj[k], depth + 1); });
          Object.values(obj).forEach(v => { if (v) walk(v, depth + 1); });
        }
        walk(scope, 0);
      }
    }
    document.querySelectorAll('video').forEach(v => {
      if (v.src) allVideoLinks.push(v.src);
      v.querySelectorAll('source').forEach(s => allVideoLinks.push(s.src || s.getAttribute('src')));
    });
  } catch (e) {}

  // 🌟 核心逻辑：高级去重、权重排序与过滤 🌟
  const uniqueVideos = [];
  const hashSeen = new Set();

  const cleanedList = allVideoLinks.map(raw => {
    const url = raw.trim().replace(/\\u002F/g, '/');
    const base = url.split('?')[0]; 
    const hasParams = url.includes('?');
    const hashMatch = base.match(/\/([a-z0-9]{30,})/i);
    const hash = hashMatch ? hashMatch[1] : base;
    
    // 识别 259 后缀（带水印）
    const isWatermarked = base.includes('_259.mp4');
    
    // 计算权重：越高越清晰
    let weight = 0;
    if (base.includes('1080')) weight += 100;
    if (base.includes('h265')) weight += 50;
    if (base.includes('720'))  weight += 30;
    if (!hasParams)            weight += 10; // 无参数通常更原始
    
    return { url, base, hash, hasParams, isWatermarked, weight };
  }).filter(item => item.base.startsWith('http'));

  // 排序：权重越高越靠前，同权重下无参数优先
  cleanedList.sort((a, b) => b.weight - a.weight);

  for (const item of cleanedList) {
    if (!hashSeen.has(item.hash)) {
      hashSeen.add(item.hash);
      uniqueVideos.push({
        url: item.url,
        isWatermarked: item.isWatermarked,
        weight: item.weight
      });
    }
  }

  return {
    videos: uniqueVideos, 
    cover: detectedCover, // 🌟 返回精准提取的封面
    images: [...new Set(images)].filter(u => u && u.startsWith('http'))
  };
}

// ── YouTube 下载核心逻辑 ──────────────────────────────────────────
async function handleYouTubeDownload(videoId, formatCode) {
  if (currentTask.active) return;

  updateTask({
    active: true,
    platform: 'youtube',
    progress: 15,
    text: '正在提交转换任务...',
    error: '',
    dlUrl: ''
  });

  try {
    const convertUrl = `https://loader.to/ajax/download.php`
      + `?format=${formatCode}`
      + `&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`
      + `&timeStamp=${Date.now()}`;

    const r = await fetch(convertUrl, { headers: { Accept: 'application/json' } });
    const convertData = await r.json();
    const taskId = convertData?.id;

    if (!taskId) throw new Error('服务暂不可用，请稍后再试');

    updateTask({ progress: 35, text: '视频转换中，请稍候...' });

    const pollUrl = convertData.progress_url || `https://loader.to/ajax/progress.php?id=${taskId}`;
    let dlUrl = null;

    for (let i = 0; i < 300; i++) {
      await sleep(3000);
      let pd;
      try {
        pd = await (await fetch(pollUrl)).json();
      } catch (e) { continue; }

      const pct = Math.min(Math.round((parseInt(pd?.progress) || 0) / 10), 100);
      updateTask({
        progress: 35 + Math.round(pct * 0.6),
        text: `转换进度 ${pct}%（${pd?.text || '处理中'}）...`
      });

      if (pd?.download_url) { dlUrl = pd.download_url; break; }
      if (pd?.success == 1 && (pd?.url || pd?.link)) { dlUrl = pd.url || pd.link; break; }
      if (pd?.error) throw new Error('转换失败，请尝试切换画质');
    }

    if (!dlUrl) throw new Error('转换超时，请尝试 720p 画质');

    updateTask({ progress: 100, text: '✅ 转换完成，开始下载', dlUrl });
    triggerDownload(dlUrl);
    showNotification('下载开始', 'YouTube 视频转换成功，正在保存文件。');

    // 延时重置状态
    await sleep(5000);
    updateTask({ active: false });

  } catch (err) {
    updateTask({ active: false, error: err.message });
    showNotification('下载失败', err.message);
  }
}

// ── 小红书下载核心逻辑 ─────────────────────────────────────────────
async function handleXhsDownload(urls, typeLabel) {
  if (currentTask.active) return;

  updateTask({
    active: true,
    platform: 'xhs',
    progress: 80,
    text: `正在准备下载 ${urls.length} 个${typeLabel}...`,
    error: '',
    dlUrl: ''
  });

  try {
    for (let i = 0; i < urls.length; i++) {
      triggerDownload(urls[i]);
      if (i < urls.length - 1) await sleep(500);
      updateTask({
        progress: 80 + Math.round(((i + 1) / urls.length) * 20),
        text: `正在下载第 ${i + 1}/${urls.length} 个...`
      });
    }

    updateTask({ progress: 100, text: `✅ ${urls.length} 个${typeLabel}已全部开始下载` });
    showNotification('下载开始', `小红书的 ${urls.length} 个资源已加入下载队列。`);

    await sleep(5000);
    updateTask({ active: false });
  } catch (err) {
    updateTask({ active: false, error: err.message });
  }
}
