// ================================================================
// 视频下载器 Pro - Content Script (Full Logic Streamlined)
// ================================================================

(function() {
  if (window.VD_PRO_INJECTED) return;
  window.VD_PRO_INJECTED = true;

  let panelVisible = false;
  let shadowRoot   = null;
  let floatBtn     = null;
  
  let selectedQuality = '1080';
  let selectedFormat  = 'mp4';

  const DOWNLOAD_BTN_HTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 立即下载`;

  // ── 判断当前 URL 是否支持 ───────────────────────────────────────
  function isSupportedPage() {
    const url = window.location.href;
    const h = window.location.hostname;
    const isYT = h.includes('youtube.com') && (url.includes('v=') || url.includes('/shorts/'));
    const isXHS = h.includes('xiaohongshu.com') && (url.includes('/explore/') || url.includes('/discovery/'));
    const isBili = h.includes('bilibili.com') && url.includes('/video/');
    const isDouyin = h.includes('douyin.com') && (url.includes('/video/') || url.includes('modal_id=') || url.includes('/note/'));
    return isYT || isXHS || isBili || isDouyin;
  }

  // 辅助：检查是否属于支持的四大平台域名
  function isSupportedDomain() {
    const h = location.hostname;
    return ['youtube.com', 'xiaohongshu.com', 'bilibili.com', 'douyin.com'].some(d => h.includes(d));
  }

  async function init() {
    if (!document.documentElement) {
      window.addEventListener('DOMContentLoaded', init);
      return;
    }

    createPanel();
    checkAndRenderFloatBtn();

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'TOGGLE_FLOAT_BTN') {
        checkAndRenderFloatBtn();
      } else if (msg.type === 'STATUS_UPDATE') {
        if (panelVisible) syncTaskUI(msg.task);
      }
    });

    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (!chrome.runtime?.id) { observer.disconnect(); return; }

      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (panelVisible) refreshInfo();
        checkAndRenderFloatBtn();
      } else {
        // 守护按钮：防止动态刷新导致的按钮丢失
        if (isSupportedPage() && (!floatBtn || !document.documentElement.contains(floatBtn))) {
          checkAndRenderFloatBtn();
        }
      }
    });
    
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function checkAndRenderFloatBtn() {
    if (!chrome.runtime?.id) return;
    try {
      const res = await chrome.storage.local.get(['showFloatBtn']);
      const enabled = res.showFloatBtn !== false;
      
      if (enabled && isSupportedPage()) {
        if (!floatBtn || !document.documentElement.contains(floatBtn)) createFloatBtn();
      } else if (!enabled || !isSupportedDomain()) {
        removeFloatBtn();
      }
    } catch (e) {}
  }

  function createFloatBtn() {
    if (floatBtn && document.documentElement.contains(floatBtn)) return;
    if (!floatBtn) {
      floatBtn = document.createElement('div');
      floatBtn.id = 'vd-pro-float-btn';
      floatBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:24px;height:24px;display:block"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const s = floatBtn.style;
      s.setProperty('position', 'fixed', 'important');
      s.setProperty('right', '24px', 'important');
      s.setProperty('width', '52px', 'important');
      s.setProperty('height', '52px', 'important');
      s.setProperty('background', 'linear-gradient(135deg, #0066FF, #0052CC)', 'important');
      s.setProperty('color', 'white', 'important');
      s.setProperty('border-radius', '50%', 'important');
      s.setProperty('cursor', 'grab', 'important');
      s.setProperty('display', 'flex', 'important');
      s.setProperty('align-items', 'center', 'important');
      s.setProperty('justify-content', 'center', 'important');
      s.setProperty('box-shadow', '0 10px 25px rgba(0, 102, 255, 0.3)', 'important');
      s.setProperty('z-index', '2147483647', 'important');
      s.setProperty('transition', 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', 'important');
      s.setProperty('border', '1px solid rgba(255,255,255,0.4)', 'important');
      s.setProperty('user-select', 'none', 'important');

      chrome.storage.local.get(['floatBtnBottom'], (res) => {
        s.setProperty('bottom', (res.floatBtnBottom || 80) + 'px', 'important');
      });

      let isDragging = false, startY = 0, startBottom = 0, hasMoved = false;
      floatBtn.onmousedown = (e) => {
        isDragging = true; hasMoved = false; startY = e.clientY;
        startBottom = parseInt(floatBtn.style.bottom) || 80;
        floatBtn.style.cursor = 'grabbing'; floatBtn.style.transition = 'none';
        e.preventDefault();
      };
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaY = startY - e.clientY;
        if (Math.abs(deltaY) > 5) hasMoved = true;
        let newBottom = Math.max(20, Math.min(startBottom + deltaY, window.innerHeight - 70));
        floatBtn.style.setProperty('bottom', newBottom + 'px', 'important');
      });
      window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false; floatBtn.style.cursor = 'grab';
        floatBtn.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), bottom 0.3s ease';
        chrome.storage.local.set({ floatBtnBottom: parseInt(floatBtn.style.bottom) });
      });
      floatBtn.onclick = (e) => { if (!hasMoved) { e.stopPropagation(); togglePanel(); } };
    }
    document.documentElement.appendChild(floatBtn);
  }

  function removeFloatBtn() { if (floatBtn) { floatBtn.remove(); floatBtn = null; } }

  function createPanel() {
    let container = document.getElementById('vd-pro-panel-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'vd-pro-panel-container';
    container.style.setProperty('position', 'fixed', 'important');
    container.style.setProperty('z-index', '2147483647', 'important');
    document.documentElement.appendChild(container);
    shadowRoot = container.attachShadow({ mode: 'open' });

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('popup.css');
    shadowRoot.appendChild(styleLink);

    const extraStyle = document.createElement('style');
    extraStyle.textContent = `
      #panel-wrap { position: fixed; right: 24px; bottom: 150px; width: 360px; transform: translateX(420px); opacity: 0; transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12); overflow: hidden; }
      #panel-wrap.show { transform: translateX(0); opacity: 1; pointer-events: auto; }
      .close-btn { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: #86868B; cursor: pointer; padding: 4px; z-index: 20; }
    `;
    shadowRoot.appendChild(extraStyle);

    const wrap = document.createElement('div');
    wrap.id = 'panel-wrap';
    wrap.innerHTML = `
      <button class="close-btn" id="panel-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      <div class="app-container">
        <header class="app-header">
          <div class="logo"><div class="logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><h1>PureDown <span>Pro</span></h1></div>
        </header>
        <main class="app-content">
          <section id="state-loading" class="state active">
            <div class="media-card" style="box-shadow:none; border-color:#F2F2F7"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-btn"></div></div>
            <p style="text-align:center; font-size:11px; color:#AEAEB2; margin-top:12px; font-weight:600">正在分析页面数据...</p>
          </section>
          <section id="state-error" class="state"><div class="empty-state"><div class="empty-icon">⚠️</div><p id="error-text">请在视频或笔记详情页使用</p></div></section>
          <section id="state-youtube" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 10px; gap: 10px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative; background: #000;"><img id="yt-thumb" src="" style="width: 100%; height: 100%; object-fit: cover;"><div id="yt-type-tag" class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; background: rgba(255,255,255,0.9); color: #000; position: absolute; border-radius: 3px; font-weight: 800;">YT</div></div>
                <div style="flex:1; min-width: 0;"><h2 id="yt-title" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2><p id="yt-channel" style="font-size: 10px; margin: 2px 0 0; color: #86868B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></p></div>
              </div>
              <div class="controls" style="padding: 12px;">
                <label class="control-label" style="margin-top: 0;">下载格式</label>
                <div class="segmented-control"><button class="format-btn selected" data-format="mp4">视频 (MP4)</button><button class="format-btn" data-format="mp3">音频 (MP3)</button></div>
                <label id="quality-label" class="control-label">选择画质</label>
                <div id="quality-grid" class="quality-grid"><button class="quality-btn" data-quality="2160">4K</button><button class="quality-btn selected" data-quality="1080">1080P</button><button class="quality-btn" data-quality="720">720P</button><button class="quality-btn" data-quality="480">480P</button></div>
                <div id="yt-progress-wrap" class="progress-container"><div class="progress-bar"><div id="yt-progress-fill" class="progress-fill"></div></div><p id="yt-progress-label" class="progress-text">准备就绪</p></div>
                <button id="yt-download-btn" class="main-btn">${DOWNLOAD_BTN_HTML}</button><p id="yt-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
          <section id="state-xhs" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative;"><img id="xhs-thumb" src="" style="width: 100%; height: 100%; object-fit: cover;"><div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #ff2442;">Red</div></div>
                <div style="flex: 1; min-width: 0;"><h2 id="xhs-title" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2><p id="xhs-author" style="font-size: 10px; margin-top: 2px; color: #86868B;"></p></div>
              </div>
              <div class="controls" style="padding: 12px;">
                <p id="xhs-status-hint" class="hint-text" style="margin-bottom: 12px;">检测资源中...</p>
                <div id="xhs-progress-wrap" class="progress-container"><div class="progress-bar"><div id="xhs-progress-fill" class="progress-fill"></div></div><p id="xhs-progress-label" class="progress-text">准备就绪</p></div>
                <div id="xhs-btn-group" style="display: flex; gap: 8px; margin-top: 12px;"><button id="xhs-hd-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0;">高清版</button><button id="xhs-nowm-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0; background:#34C759;">无水印</button><button id="xhs-all-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0; background:#8E8E93;">全部</button></div>
                <button id="xhs-download-btn" class="main-btn" style="display:none">下载图片</button><p id="xhs-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
          <section id="state-bilibili" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative;"><img id="bili-thumb" src="" style="width: 100%; height: 100%; object-fit: cover;"><div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #fb7299; font-weight: bold; background: rgba(255,255,255,0.9); position: absolute; border-radius: 3px;">Bili</div></div>
                <div style="flex: 1; min-width: 0;"><h2 id="bili-title" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2><p id="bili-author" style="font-size: 10px; margin-top: 2px; color: #86868B;"></p></div>
              </div>
              <div class="controls" style="padding: 12px;">
                <div id="bili-progress-wrap" class="progress-container" style="margin-bottom: 12px;"><div class="progress-bar"><div id="bili-progress-fill" class="progress-fill"></div></div><p id="bili-progress-label" class="progress-text">准备就绪</p></div>
                <button id="bili-download-btn" class="main-btn" style="margin-top:0; width:100%; font-size:12px; padding:12px 0;">${DOWNLOAD_BTN_HTML} (合并版)</button><p id="bili-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
          <section id="state-douyin" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative;"><img id="dy-thumb" src="" style="width: 100%; height: 100%; object-fit: cover;"><div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #FE2C55; font-weight: bold; background: rgba(255,255,255,0.9); position: absolute; border-radius: 3px;">DY</div></div>
                <div style="flex: 1; min-width: 0;"><h2 id="dy-title" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2><p id="dy-author" style="font-size: 10px; margin-top: 2px; color: #86868B;">@抖音视频</p></div>
              </div>
              <div class="controls" style="padding: 12px;">
                <div id="dy-progress-wrap" class="progress-container" style="margin-bottom: 12px;"><div class="progress-bar"><div id="dy-progress-fill" class="progress-fill"></div></div><p id="dy-progress-label" class="progress-text">准备就绪</p></div>
                <button id="dy-download-btn" class="main-btn" style="margin-top:0; width:100%; font-size:12px; padding:12px 0;">${DOWNLOAD_BTN_HTML} (无水印)</button><p id="dy-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
        </main>
      </div>
    `;
    shadowRoot.appendChild(wrap);
    shadowRoot.getElementById('panel-close').onclick = () => togglePanel();
    shadowRoot.querySelectorAll('.format-btn').forEach(btn => btn.onclick = () => selectFormat(btn));
    shadowRoot.querySelectorAll('.quality-btn').forEach(btn => btn.onclick = () => selectQuality(btn));
    shadowRoot.getElementById('yt-download-btn').onclick = startYouTubeDownload;
    shadowRoot.getElementById('xhs-hd-btn').onclick = () => startXhsDownload('hd');
    shadowRoot.getElementById('xhs-nowm-btn').onclick = () => startXhsDownload('nowm');
    shadowRoot.getElementById('xhs-all-btn').onclick = () => startXhsDownload('all');
    shadowRoot.getElementById('xhs-download-btn').onclick = () => startXhsDownload('images');
    if (shadowRoot.getElementById('bili-download-btn')) shadowRoot.getElementById('bili-download-btn').onclick = startBilibiliDownload;
    if (shadowRoot.getElementById('dy-download-btn')) shadowRoot.getElementById('dy-download-btn').onclick = startDouyinDownload;
  }

  function switchState(stateId) {
    shadowRoot.querySelectorAll('.state').forEach(s => { s.classList.toggle('active', s.id === stateId); });
  }

  function togglePanel() {
    panelVisible = !panelVisible;
    const wrap = shadowRoot.getElementById('panel-wrap');
    if (panelVisible) { wrap.classList.add('show'); refreshInfo(); }
    else { wrap.classList.remove('show'); }
  }

  async function refreshInfo() {
    if (!isSupportedPage()) {
      switchState('state-error');
      shadowRoot.getElementById('error-text').textContent = isSupportedDomain() ? '请先进入视频详情页' : '暂不支持此页面下载';
      return;
    }
    switchState('state-loading');
    const url = window.location.href;
    if (url.includes('youtube.com')) initYouTubeUI();
    else if (url.includes('xiaohongshu.com')) initXhsUI();
    else if (url.includes('bilibili.com')) initBilibiliUI();
    else if (url.includes('douyin.com')) setTimeout(() => initDouyinUI(), 500);
  }

  async function initYouTubeUI() {
    const id = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1] || window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/)?.[2];
    if (!id) return;
    const img = shadowRoot.getElementById('yt-thumb');
    img.src = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    img.onerror = () => { img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; };
    shadowRoot.getElementById('yt-title').textContent = document.title.replace(' - YouTube', '');
    shadowRoot.getElementById('yt-channel').textContent = document.querySelector('#channel-name a')?.textContent || '';
    shadowRoot.getElementById('yt-type-tag').textContent = window.location.href.includes('/shorts/') ? 'Shorts' : 'YT';
    switchState('state-youtube');
  }

  async function initXhsUI() {
    const title = document.title.replace(/ [-|] 小红书$/, '');
    const author = document.querySelector('.username')?.textContent || document.querySelector('.author-name')?.textContent || '';
    chrome.runtime.sendMessage({ type: 'EXEC_XHS_EXTRACT' }).then(media => {
      const img = shadowRoot.getElementById('xhs-thumb');
      const thumbUrl = media?.cover || document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      if (thumbUrl) { img.src = thumbUrl; img.style.display = 'block'; }
      const hasVideos = media?.videos && media.videos.length > 0;
      const hasImages = media?.images && media.images.length > 0;
      shadowRoot.getElementById('xhs-btn-group').style.display = hasVideos ? 'flex' : 'none';
      shadowRoot.getElementById('xhs-download-btn').style.display = hasImages ? 'block' : 'none';
      shadowRoot.getElementById('xhs-status-hint').textContent = hasVideos ? `检测到 ${media.videos.length} 个视频` : `检测到 ${media?.images?.length || 0} 张图片`;
      switchState('state-xhs');
    });
    shadowRoot.getElementById('xhs-title').textContent = title;
    shadowRoot.getElementById('xhs-author').textContent = author ? `@${author.trim()}` : '';
  }

  async function initBilibiliUI() {
    shadowRoot.getElementById('bili-title').textContent = document.title.replace('_哔哩哔哩_bilibili', '');
    const authorEl = document.querySelector('.up-name') || document.querySelector('.up-info .name');
    shadowRoot.getElementById('bili-author').textContent = authorEl ? `@${authorEl.textContent.trim()}` : '';
    const img = shadowRoot.getElementById('bili-thumb'), thumbUrl = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    if (thumbUrl) { img.src = thumbUrl.startsWith('//') ? 'https:' + thumbUrl : thumbUrl; img.style.display = 'block'; }
    switchState('state-bilibili');
  }

  async function initDouyinUI(retryCount = 0) {
    const media = await chrome.runtime.sendMessage({ type: 'EXEC_DOUYIN_EXTRACT' });
    if (media) {
      shadowRoot.getElementById('dy-title').textContent = media.title || document.title;
      shadowRoot.getElementById('dy-author').textContent = media.author ? `@${media.author}` : '@抖音视频';
      const img = shadowRoot.getElementById('dy-thumb');
      if (media.cover) { img.src = media.cover; img.style.display = 'block'; }
      switchState('state-douyin');
    } else if (retryCount < 5) {
      setTimeout(() => initDouyinUI(retryCount + 1), 1000);
    } else {
      switchState('state-error');
      shadowRoot.getElementById('error-text').textContent = '未找到视频数据，请尝试刷新';
    }
  }

  async function startDouyinDownload() {
    const wrap = shadowRoot.getElementById('dy-progress-wrap');
    wrap.classList.add('show');
    try {
      syncTaskUI({ active: true, platform: 'douyin', progress: 5, text: '解析中...' });
      const media = await chrome.runtime.sendMessage({ type: 'EXEC_DOUYIN_EXTRACT' });
      if (!media || !media.url) throw new Error('提取失败');
      const response = await fetch(media.url);
      if (!response.ok) throw new Error(`响应失败 (${response.status})`);
      const total = parseInt(response.headers.get('content-length'), 10) || 0, reader = response.body.getReader(), chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        if (total > 0) syncTaskUI({ active: true, platform: 'douyin', progress: 15 + Math.round((loaded/total)*80), text: `下载中: ${(loaded/1024/1024).toFixed(1)}MB` });
      }
      const blob = new Blob(chunks, { type: 'video/mp4' }), blobUrl = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = blobUrl; a.download = `douyin_${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(blobUrl);
      syncTaskUI({ active: false, platform: 'douyin', progress: 100, text: '✅ 下载成功' });
    } catch (e) { syncTaskUI({ active: false, platform: 'douyin', error: e.message }); }
  }

  function selectFormat(btn) {
    shadowRoot.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); selectedFormat = btn.dataset.format;
    const show = selectedFormat !== 'mp3';
    shadowRoot.getElementById('quality-grid').style.display = show ? 'grid' : 'none';
    shadowRoot.getElementById('quality-label').style.display = show ? 'block' : 'none';
  }

  function selectQuality(btn) {
    shadowRoot.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); selectedQuality = btn.dataset.quality;
  }

  function startYouTubeDownload() {
    const id = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1] || window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/)?.[2];
    if (id) chrome.runtime.sendMessage({ type: 'START_YT_DOWNLOAD', videoId: id, formatCode: selectedFormat === 'mp3' ? 'mp3' : selectedQuality });
  }

  async function startXhsDownload(mode) {
    try {
      const media = await chrome.runtime.sendMessage({ type: 'EXEC_XHS_EXTRACT' });
      if (!media) throw new Error('提取失败');
      let urls = [], typeLabel = '视频';
      if (mode === 'images') { urls = media.images; typeLabel = '图片'; }
      else {
        if (!media.videos || media.videos.length === 0) throw new Error('未检测到视频');
        if (mode === 'hd') urls = [media.videos[0].url];
        else if (mode === 'nowm') { const clean = media.videos.filter(v => !v.isWatermarked); if (clean.length === 0) throw new Error('未找到无水印版'); urls = [clean[0].url]; }
        else urls = media.videos.map(v => v.url);
      }
      chrome.runtime.sendMessage({ type: 'START_XHS_DOWNLOAD', urls, type_label: typeLabel });
    } catch (e) { shadowRoot.getElementById('xhs-error-msg').textContent = '❌ ' + e.message; shadowRoot.getElementById('xhs-error-msg').classList.add('show'); }
  }

  async function startBilibiliDownload() {
    try {
      syncTaskUI({ active: true, platform: 'bilibili', progress: 10, text: '解析中...' });
      const mediaUrl = await chrome.runtime.sendMessage({ type: 'EXEC_BILI_EXTRACT' });
      if (!mediaUrl) throw new Error('解析合并流失败');
      const response = await fetch(mediaUrl), reader = response.body.getReader(), chunks = [];
      const total = parseInt(response.headers.get('content-length'), 10) || 0;
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        if (total > 0) syncTaskUI({ active: true, platform: 'bilibili', progress: 20 + Math.round((loaded/total)*75), text: `下载中: ${(loaded/1024/1024).toFixed(1)}MB` });
      }
      const blob = new Blob(chunks, { type: 'video/mp4' }), blobUrl = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = blobUrl; a.download = `bili_${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(blobUrl);
      syncTaskUI({ active: false, platform: 'bilibili', progress: 100, text: '✅ 下载成功' });
    } catch (e) { syncTaskUI({ active: false, platform: 'bilibili', error: e.message }); }
  }

  function syncTaskUI(task) {
    let prefix = task.platform === 'youtube' ? 'yt' : (task.platform === 'bilibili' ? 'bili' : (task.platform === 'douyin' ? 'dy' : 'xhs'));
    const btn = shadowRoot.getElementById(`${prefix}-download-btn`), wrap = shadowRoot.getElementById(`${prefix}-progress-wrap`), fill = shadowRoot.getElementById(`${prefix}-progress-fill`), lbl = shadowRoot.getElementById(`${prefix}-progress-label`);
    if (!btn || !wrap) return;
    if (task.active) floatBtn?.classList.add('pulse-active'); else floatBtn?.classList.remove('pulse-active');
    if (task.error) { shadowRoot.getElementById(`${prefix}-error-msg`).textContent = '❌ ' + task.error; shadowRoot.getElementById(`${prefix}-error-msg`).classList.add('show'); btn.disabled = false; btn.classList.remove('loading'); }
    else if (task.progress === 100) { fill.style.width = '100%'; lbl.textContent = task.text; btn.classList.remove('loading'); btn.style.background = '#34C759'; setTimeout(() => { btn.disabled = false; btn.style.background = ''; wrap.classList.remove('show'); }, 3000); }
    else { btn.disabled = true; btn.classList.add('loading'); wrap.classList.add('show'); fill.style.width = task.progress + '%'; lbl.textContent = task.text; }
  }

  init();
})();
