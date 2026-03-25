// ================================================================
// 视频下载器 Pro v2.0
// 支持平台：YouTube / YouTube Shorts / 小红书
// 调试方式：右键插件图标 → 审查弹出内容 → Console
// ================================================================

// ── 日志工具 ─────────────────────────────────────────────────────
const LOG = {
  info:     (...a) => console.log('%c[INFO]',  'color:#4af;font-weight:bold', ...a),
  ok:       (...a) => console.log('%c[OK]',    'color:#4f4;font-weight:bold', ...a),
  warn:     (...a) => console.warn('%c[WARN]', 'color:#fa4;font-weight:bold', ...a),
  error:    (...a) => console.error('%c[ERR]', 'color:#f44;font-weight:bold', ...a),
  group:    (l)    => console.group('%c' + l,  'color:#aaf;font-weight:bold'),
  groupEnd: ()     => console.groupEnd(),
};

// ── 全局状态 ──────────────────────────────────────────────────────
let currentUrl      = '';
let currentPlatform = ''; // 'youtube' | 'shorts' | 'xhs' | 'xhs-unsupported'
let selectedQuality = '1080';
let selectedFormat  = 'mp4';

// ── 工具函数 ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function showState(id) {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  LOG.info('showState →', id);
}

function setProgress(fill, label, pct, text) {
  fill.style.width = pct + '%';
  label.textContent = text;
}

function setDownloadingUI(btn, errorMsg, progressWrap, fill, label, initText) {
  errorMsg.classList.remove('show');
  errorMsg.textContent = '';
  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> 解析中...`;
  progressWrap.classList.add('show');
  setProgress(fill, label, 15, initText);
}

function setSuccessUI(btn, progressWrap) {
  btn.innerHTML = '✅ 下载已开始';
  btn.style.background = 'linear-gradient(135deg, #1DB954, #158a3e)';
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = DOWNLOAD_BTN_HTML;
    btn.style.background = '';
    progressWrap.classList.remove('show');
  }, 3000);
}

function showError(errorMsg, progressWrap, msg) {
  progressWrap.classList.remove('show');
  errorMsg.textContent = '❌ ' + (msg || '发生未知错误，请重试');
  errorMsg.classList.add('show');
}

function resetBtn(btn) {
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = DOWNLOAD_BTN_HTML;
    btn.style.background = '';
  }, 1000);
}

const DOWNLOAD_BTN_HTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.5">
  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg> 立即下载`;

function triggerDownload(url) {
  LOG.info('triggerDownload:', url);
  if (chrome.downloads) {
    chrome.downloads.download({ url }, id => {
      if (chrome.runtime.lastError) LOG.error('下载错误:', chrome.runtime.lastError.message);
      else LOG.ok('downloadId:', id);
    });
  } else {
    window.open(url, '_blank');
  }
}

// ── 平台识别 ──────────────────────────────────────────────────────
function detectPlatform(url) {
  if (url.includes('youtube.com/shorts/')) return 'shorts';
  if (url.includes('youtube.com/watch'))   return 'youtube';
  if (url.includes('xiaohongshu.com')) {
    // 只支持笔记详情页，排除首页 / 个人主页 / 搜索页
    const isNote = /xiaohongshu[.]com[/](explore|discovery[/]item)[/][a-zA-Z0-9]+/.test(url);
    return isNote ? 'xhs' : 'xhs-unsupported';
  }
  return null;
}

// ── 初始化入口 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  LOG.group('=== 初始化 v2.0 ===');

  // 绑定按钮事件（CSP 不允许 HTML 内联 onclick）
  document.querySelectorAll('.format-btn').forEach(btn =>
    btn.addEventListener('click', () => selectFormat(btn)));
  document.querySelectorAll('.quality-btn').forEach(btn =>
    btn.addEventListener('click', () => selectQuality(btn)));
  document.getElementById('yt-download-btn').addEventListener('click', startYouTubeDownload);
  document.getElementById('xhs-download-btn').addEventListener('click', startXhsDownload);

  showState('state-loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl      = tab.url || '';
    currentPlatform = detectPlatform(currentUrl);
    LOG.info('URL:', currentUrl, '| Platform:', currentPlatform);

    if (!currentPlatform)              { showState('state-not-supported'); return; }
    if (currentPlatform === 'xhs-unsupported') { showState('state-xhs-hint');      return; }

    if (currentPlatform === 'youtube' || currentPlatform === 'shorts') {
      await initYouTube(tab);
    } else if (currentPlatform === 'xhs') {
      await initXhs(tab);
    }
  } catch (err) {
    LOG.error('初始化失败:', err.message, err);
    showState('state-not-supported');
  }

  LOG.groupEnd();
});

// ================================================================
// YOUTUBE
// ================================================================

function extractYouTubeId(url) {
  const watch  = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  const shorts = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  const id = (watch || shorts)?.[1] || null;
  LOG.info('YouTubeId:', id);
  return id;
}

async function initYouTube(tab) {
  LOG.group('--- YouTube 初始化 ---');

  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const title =
          document.querySelector('#title h1 yt-formatted-string')?.textContent ||
          document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.textContent ||
          document.title.replace(' - YouTube', '');
        const channel =
          document.querySelector('#channel-name a')?.textContent ||
          document.querySelector('ytd-channel-name a')?.textContent || '';
        return { title: title?.trim(), channel: channel?.trim() };
      } catch (e) {
        return { title: document.title.replace(' - YouTube', ''), channel: '' };
      }
    }
  });

  const info = res?.result || {};
  document.getElementById('yt-title').textContent   = info.title   || '未知标题';
  document.getElementById('yt-channel').textContent = info.channel || '';
  LOG.info('视频信息:', info);

  // 标签：区分普通视频和 Shorts
  const tag = document.getElementById('yt-type-tag');
  tag.textContent = currentPlatform === 'shorts' ? 'Shorts' : 'YouTube';
  tag.className   = `type-tag ${currentPlatform === 'shorts' ? 'shorts' : 'youtube'}`;

  // 封面图
  const videoId = extractYouTubeId(currentUrl);
  if (videoId) {
    const img = document.getElementById('yt-thumb');
    img.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    img.onerror = () => { img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; };
  }

  showState('state-youtube');
  LOG.ok('YouTube 界面就绪');
  LOG.groupEnd();
}

function selectFormat(btn) {
  document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedFormat = btn.dataset.format;
  LOG.info('Format →', selectedFormat);
  const showQuality = selectedFormat !== 'mp3';
  document.getElementById('quality-grid').style.display  = showQuality ? 'grid'  : 'none';
  document.getElementById('quality-label').style.display = showQuality ? 'block' : 'none';
}

function selectQuality(btn) {
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedQuality = btn.dataset.quality;
  LOG.info('Quality →', selectedQuality);
}

async function startYouTubeDownload() {
  LOG.group('=== YouTube 下载 ===');

  const btn          = document.getElementById('yt-download-btn');
  const errorMsg     = document.getElementById('yt-error-msg');
  const progressWrap = document.getElementById('yt-progress-wrap');
  const progressFill = document.getElementById('yt-progress-fill');
  const progressLabel = document.getElementById('yt-progress-label');

  setDownloadingUI(btn, errorMsg, progressWrap, progressFill, progressLabel, '正在解析视频...');

  try {
    const videoId = extractYouTubeId(currentUrl);
    if (!videoId) throw new Error('无法提取视频 ID');

    // loader.to 格式代码：mp3 / 480 / 720 / 1080 / 2160
    const formatCode = selectedFormat === 'mp3' ? 'mp3' : selectedQuality;
    LOG.info('格式:', formatCode, '| 视频 ID:', videoId);

    setProgress(progressFill, progressLabel, 25, '正在提交转换任务...');

    // Step 1：提交任务
    const convertUrl = `https://loader.to/ajax/download.php`
      + `?format=${formatCode}`
      + `&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`
      + `&timeStamp=${Date.now()}`;
    LOG.info('提交 URL:', convertUrl);

    let convertData;
    try {
      const r = await fetch(convertUrl, { headers: { Accept: 'application/json' } });
      convertData = await r.json();
      LOG.ok('提交响应:', JSON.stringify(convertData));
    } catch (e) {
      throw new Error('提交任务失败: ' + e.message);
    }

    const taskId = convertData?.id;
    if (!taskId) throw new Error('服务未返回任务 ID，请重试');

    setProgress(progressFill, progressLabel, 35, '视频转换中，请稍候...');

    // Step 2：轮询进度（最多 10 分钟，progress 满值为 1000）
    const pollUrl = convertData.progress_url
      || `https://loader.to/ajax/progress.php?id=${taskId}`;
    LOG.info('轮询 URL:', pollUrl);

    let dlUrl = null;
    for (let i = 0; i < 300; i++) {
      await sleep(2000);
      let pd;
      try {
        pd = await (await fetch(pollUrl)).json();
        LOG.info(`#${i + 1}:`, JSON.stringify(pd));
      } catch (e) {
        LOG.warn(`#${i + 1} 异常:`, e.message);
        continue;
      }

      const pct = Math.min(Math.round((parseInt(pd?.progress) || 0) / 10), 100);
      setProgress(progressFill, progressLabel,
        35 + Math.round(pct * 0.6),
        `转换进度 ${pct}%（${pd?.text || '处理中'}）...`);

      if (pd?.download_url) { dlUrl = pd.download_url; break; }
      if (pd?.success == 1 && (pd?.url || pd?.link)) { dlUrl = pd.url || pd.link; break; }
      if (pd?.error) throw new Error('转换失败，请换画质重试');
    }

    if (!dlUrl) throw new Error('转换超时（已等待 10 分钟），请稍后重试或换 720p');

    setProgress(progressFill, progressLabel, 100, '✅ 开始下载！');
    triggerDownload(dlUrl);
    setSuccessUI(btn, progressWrap);

  } catch (err) {
    LOG.error('下载失败:', err.message);
    showError(errorMsg, progressWrap, err.message);
    resetBtn(btn);
  }
  LOG.groupEnd();
}

// ================================================================
// 小红书
// ================================================================

async function initXhs(tab) {
  LOG.group('--- 小红书初始化 ---');

  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractXhsInfo,
    world: 'MAIN',
  });

  const info = res?.result || {};
  document.getElementById('xhs-title').textContent  = info.title  || '小红书笔记';
  document.getElementById('xhs-author').textContent = info.author ? `@${info.author}` : '';
  LOG.info('XHS 页面信息:', info);

  if (info.cover) {
    const img = document.getElementById('xhs-thumb');
    img.src = info.cover;
    img.onerror = () => { img.style.display = 'none'; };
  }

  showState('state-xhs');
  LOG.ok('XHS 界面就绪');
  LOG.groupEnd();
}

// 注入到小红书页面 —— 提取标题 / 作者 / 封面
function extractXhsInfo() {
  try {
    const title =
      document.querySelector('#detail-title')?.textContent ||
      document.querySelector('.note-content .title')?.textContent ||
      document.querySelector('h1')?.textContent ||
      document.title.replace(/ [-|] 小红书$/, '');

    const author =
      document.querySelector('.username')?.textContent ||
      document.querySelector('.author .name')?.textContent ||
      document.querySelector('[class*="author"] [class*="name"]')?.textContent || '';

    const cover =
      document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('.note-slider img')?.src ||
      document.querySelector('video')?.poster || '';

    return { title: title?.trim(), author: author?.trim(), cover };
  } catch (e) {
    return { title: document.title, author: '', cover: '' };
  }
}

async function startXhsDownload() {
  LOG.group('=== 小红书下载 ===');

  const btn          = document.getElementById('xhs-download-btn');
  const errorMsg     = document.getElementById('xhs-error-msg');
  const progressWrap = document.getElementById('xhs-progress-wrap');
  const progressFill = document.getElementById('xhs-progress-fill');
  const progressLabel = document.getElementById('xhs-progress-label');

  setDownloadingUI(btn, errorMsg, progressWrap, progressFill, progressLabel, '正在分析页面...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 小红书是 SPA，__INITIAL_STATE__ 可能尚未挂载，最多重试 5 次
    let media = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      setProgress(progressFill, progressLabel,
        20 + attempt * 10,
        attempt === 1 ? '正在提取媒体链接...' : `第 ${attempt} 次尝试（等待页面渲染）...`);

      LOG.info(`尝试 ${attempt}/5`);

      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractXhsMedia,
        world: 'MAIN', // 必须在主世界才能访问 window.__INITIAL_STATE__
      });

      media = res?.result;
      LOG.info(`尝试 ${attempt} 结果:`, JSON.stringify(media?.debug));

      if (media?.videos?.length || media?.images?.length) break;
      if (attempt < 5) await sleep(1500);
    }

    if (!media?.videos?.length && !media?.images?.length) {
      throw new Error('未能提取到媒体内容。请确认：① 笔记已完全加载 ② 视频请先点击播放 ③ 刷新后重试');
    }

    setProgress(progressFill, progressLabel, 80, '准备下载...');

    if (media.videos?.length) {
      LOG.ok(`下载 ${media.videos.length} 个视频`);
      for (const url of media.videos) { triggerDownload(url); await sleep(400); }
      setProgress(progressFill, progressLabel, 100, `✅ ${media.videos.length} 个视频开始下载！`);
    } else {
      LOG.ok(`下载 ${media.images.length} 张图片`);
      for (const url of media.images) { triggerDownload(url); await sleep(400); }
      setProgress(progressFill, progressLabel, 100, `✅ ${media.images.length} 张图片开始下载！`);
    }

    setSuccessUI(btn, progressWrap);

  } catch (err) {
    LOG.error('XHS 下载失败:', err.message, err);
    showError(errorMsg, progressWrap, err.message);
    resetBtn(btn);
  }
  LOG.groupEnd();
}

// 注入到小红书页面 —— 提取媒体链接
function extractXhsMedia() {
  const videos   = [];
  const images   = [];
  const debugLog = [];

  // ── 辅助：标准化并收集 URL ──────────────────────────────────────
  function addVideo(url) {
    if (!url || typeof url !== 'string') return;
    url = url.trim().replace(/\\u002F/g, '/');
    if (url.startsWith('blob:') || url.length < 20 || videos.includes(url)) return;
    videos.push(url);
    debugLog.push('V: ' + url.slice(0, 80));
  }

  function addImage(url) {
    if (!url || typeof url !== 'string') return;
    url = url.trim().replace(/\\u002F/g, '/');
    if (url.length < 20 || !url.startsWith('http')) return;
    // 去掉小红书图片缩略参数（! 或 @ 后面是尺寸描述）
    const clean = url.split('!')[0].split('@')[0];
    if (images.includes(clean)) return;
    images.push(clean);
    debugLog.push('I: ' + clean.slice(0, 80));
  }

  try {
    // ── 策略 A：window.__INITIAL_STATE__（精准定位当前笔记）──────────
    const dataRoot = window.__INITIAL_STATE__ || window.__pinia || null;
    debugLog.push('dataRoot: ' + (dataRoot ? 'found' : 'null'));

    if (dataRoot) {
      // 从 URL 提取当前笔记 ID，避免抓到推荐内容里的其他视频
      const noteIdMatch = location.pathname.match(
        /[/]explore[/]([a-f0-9]+)|[/]discovery[/]item[/]([a-f0-9]+)/i
      );
      const noteId = noteIdMatch ? (noteIdMatch[1] || noteIdMatch[2]) : null;
      debugLog.push('noteId: ' + noteId);

      // 在数据树中找到当前笔记节点
      let noteData = null;
      function findNote(obj, depth) {
        if (!obj || depth > 10 || typeof obj !== 'object' || noteData) return;
        if (obj.noteId === noteId || obj.id === noteId) { noteData = obj; return; }
        if (noteId && obj[noteId])                       { noteData = obj[noteId]; return; }
        Object.values(obj).forEach(v => { if (v && typeof v === 'object') findNote(v, depth + 1); });
      }
      if (noteId) findNote(dataRoot, 0);
      debugLog.push('noteData: ' + (noteData ? 'found' : 'null'));

      // 在笔记节点内递归提取媒体（找不到精准节点时跳过，由策略B/C补充）
      const scope = noteData || null;
      if (scope) {
        const seen = new WeakSet();
        function walk(obj, depth) {
          if (!obj || depth > 15 || (typeof obj === 'object' && seen.has(obj))) return;
          if (typeof obj === 'object') seen.add(obj);
          if (typeof obj === 'string') {
            if (/sns-video|\.mp4/.test(obj))                     addVideo(obj);
            if (/sns-img|sns-webpcdn|ci\.xiaohongshu/.test(obj)) addImage(obj);
            return;
          }
          if (Array.isArray(obj)) { obj.forEach(i => walk(i, depth + 1)); return; }
          // 优先遍历已知媒体字段
          ['masterUrl', 'url', 'h264Url', 'h265Url', 'backupUrls',
           'imageScene', 'urlPre', 'urlDefault', 'infoList'].forEach(k => {
            if (obj[k]) walk(obj[k], depth + 1);
          });
          Object.values(obj).forEach(v => { if (v) walk(v, depth + 1); });
        }
        walk(scope, 0);
      }
    }

    // ── 策略 B：<video> 标签（视频已开始播放时最可靠）─────────────────
    document.querySelectorAll('video').forEach(v => {
      addVideo(v.src);
      addVideo(v.getAttribute('data-src'));
      addVideo(v.getAttribute('data-url'));
      v.querySelectorAll('source').forEach(s => addVideo(s.src || s.getAttribute('src')));
    });
    debugLog.push('after <video>: ' + videos.length);

    // ── 策略 C：正则扫描 <script> 内容（兜底）──────────────────────────
    document.querySelectorAll('script').forEach(s => {
      const t = s.textContent || '';
      if (!t.includes('sns-video') && !t.includes('.mp4') && !t.includes('sns-img')) return;
      for (const m of t.matchAll(/"(https:\/\/sns-video[^"]{5,}?)"/g))   addVideo(m[1]);
      for (const m of t.matchAll(/"(https:\/\/[^"]{5,}?\.mp4[^"]{0,200}?)"/g)) addVideo(m[1]);
      for (const m of t.matchAll(/"(https:\/\/sns-img[^"]{5,}?)"/g))     addImage(m[1]);
    });
    debugLog.push('after <script>: v=' + videos.length + ' i=' + images.length);

    // ── 策略 D：<img> DOM（已渲染的大图）────────────────────────────────
    document.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src || img.getAttribute('data-src');
      if (!src) return;
      if (/sns-img|sns-webpcdn|ci\.xiaohongshu/.test(src)) {
        if ((img.naturalWidth || img.width || 0) >= 200) addImage(src);
      }
    });
    debugLog.push('after <img>: i=' + images.length);

  } catch (e) {
    debugLog.push('ERROR: ' + e.message);
    console.error('[XHS Extract]', e);
  }

  // ── 视频去重：按视频 ID 分组，每组只保留主 CDN + 最高分辨率 ─────────
  // URL 格式: /stream/XX/110/RES/HASH_RES.mp4
  // HASH 前 16 位对同一视频的所有分辨率版本保持不变
  function getResolution(url) {
    const m = url.match(/_(\d+)\.mp4$/i);
    return m ? parseInt(m[1]) : 0;
  }
  function getVideoKey(url) {
    const filename = url.split('/').pop();   // HASH_RES.mp4
    return filename.split('_')[0].slice(0, 16); // 前16位
  }

  const validVideos = [...new Set(videos)].filter(u =>
    u && u.startsWith('http') &&
    (u.includes('sns-video') || u.includes('sns-bak') || u.includes('.mp4')) &&
    !u.includes('new5.27') && !u.includes('dc.xhscdn.com')
  );

  const groups = {};
  for (const url of validVideos) {
    const key      = getVideoKey(url);
    const res      = getResolution(url);
    const isMaster = url.includes('sns-video');
    if (!groups[key]) {
      groups[key] = { url, res, isMaster };
    } else {
      const cur = groups[key];
      if ((!cur.isMaster && isMaster) || (cur.isMaster === isMaster && res > cur.res)) {
        groups[key] = { url, res, isMaster };
      }
    }
  }
  const finalVideos = Object.values(groups).map(g => g.url);
  const finalImages = [...new Set(images)].filter(u => u && u.startsWith('http'));

  console.log('[XHS]', 'videos:', finalVideos.length, '| images:', finalImages.length);
  console.log('[XHS Debug]', debugLog.join(' → '));

  return {
    videos: finalVideos,
    images: finalImages,
    debug:  { videoCount: finalVideos.length, imageCount: finalImages.length, log: debugLog },
  };
}
