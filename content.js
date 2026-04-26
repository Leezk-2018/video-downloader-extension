// ================================================================
// 视频下载器 Pro - Content Script (Light Mode Fix)
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
    const isYT = url.includes('youtube.com/watch') || url.includes('youtube.com/shorts/');
    const isXHS = url.includes('xiaohongshu.com/explore/');
    const isBili = url.includes('bilibili.com/video/');
    return isYT || isXHS || isBili;
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
      // 检查上下文是否依然有效
      if (!chrome.runtime?.id) {
        observer.disconnect();
        return;
      }

      // 1. 处理 URL 变化
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (panelVisible) refreshInfo();
        checkAndRenderFloatBtn();
      }
      // 2. 守护进程：防止网页动态重写导致按钮丢失
      else {
        checkAndRenderFloatBtn(true); 
      }
    });
    
    // 监听整个文档的变化
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function checkAndRenderFloatBtn(isObserverCheck = false) {
    // 再次双重检查上下文有效性
    if (!chrome.runtime?.id) return;

    try {
      const res = await chrome.storage.local.get(['showFloatBtn']);
      const enabled = res.showFloatBtn !== false;
      
      if (enabled && isSupportedPage()) {
        createFloatBtn();
      } else {
        if (!isObserverCheck) removeFloatBtn(); // 避免 Observer 循环触发
      }
    } catch (e) {
      // 捕捉并忽略上下文失效导致的错误
      if (e.message.includes('context invalidated')) {
        console.log('[VD-PRO] Extension context invalidated, stopping checks.');
      } else {
        console.error('[VD-PRO] Error checking float btn status:', e);
      }
    }
  }

  function createFloatBtn() {
    if (floatBtn && document.documentElement.contains(floatBtn)) return;
    
    if (floatBtn) {
      document.documentElement.appendChild(floatBtn);
      return;
    }

    floatBtn = document.createElement('div');
    floatBtn.id = 'vd-pro-float-btn';
    floatBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:24px;height:24px;display:block"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    
    const s = floatBtn.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('right', '24px', 'important');
    
    // 从存储中恢复位置，默认为 80px
    chrome.storage.local.get(['floatBtnBottom'], (res) => {
      s.setProperty('bottom', (res.floatBtnBottom || 80) + 'px', 'important');
    });

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

    // ── 拖拽逻辑实现 ──────────────────────────────────────────────
    let isDragging = false;
    let startY = 0;
    let startBottom = 0;
    let hasMoved = false;

    floatBtn.onmousedown = (e) => {
      isDragging = true;
      hasMoved = false;
      startY = e.clientY;
      // 确保获取有效的数值，否则使用默认值 80
      startBottom = parseInt(floatBtn.style.bottom) || 80;
      floatBtn.style.cursor = 'grabbing';
      floatBtn.style.transition = 'none'; // 拖拽时禁用平滑过渡
      e.preventDefault();
    };

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaY = startY - e.clientY;
      if (Math.abs(deltaY) > 5) hasMoved = true;

      let newBottom = startBottom + deltaY;
      
      // 边界限制：离底 20px，离顶 20px
      const maxBottom = window.innerHeight - 70;
      newBottom = Math.max(20, Math.min(newBottom, maxBottom));
      
      floatBtn.style.setProperty('bottom', newBottom + 'px', 'important');
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      floatBtn.style.cursor = 'grab';
      floatBtn.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), bottom 0.3s ease';
      
      // 保存位置
      chrome.storage.local.set({ floatBtnBottom: parseInt(floatBtn.style.bottom) });
    });

    floatBtn.onclick = (e) => {
      if (hasMoved) return; // 如果发生了明显位移，不触发点击
      e.stopPropagation();
      togglePanel();
    };

    document.documentElement.appendChild(floatBtn);
  }

  function removeFloatBtn() { if (floatBtn) { floatBtn.remove(); floatBtn = null; } }

  function createPanel() {
    let container = document.getElementById('vd-pro-panel-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'vd-pro-panel-container';
    
    const s = container.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('width', '0', 'important');
    s.setProperty('height', '0', 'important');
    s.setProperty('z-index', '2147483647', 'important');

    document.documentElement.appendChild(container);
    shadowRoot = container.attachShadow({ mode: 'open' });

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('popup.css');
    shadowRoot.appendChild(styleLink);

    const extraStyle = document.createElement('style');
    extraStyle.textContent = `
      #panel-wrap { 
        position: fixed; right: 24px; bottom: 150px; width: 360px; 
        transform: translateX(420px); opacity: 0; 
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); 
        pointer-events: none; z-index: 2147483647; 
        background: #ffffff; 
        border-radius: 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0,0,0,0.05);
        border: none;
        overflow: hidden;
      }
      #panel-wrap.show { transform: translateX(0); opacity: 1; pointer-events: auto; }
      .close-btn { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: #86868B; cursor: pointer; padding: 4px; z-index: 20; transition: color 0.2s; }
      .close-btn:hover { color: #1D1D1F; }
    `;
    shadowRoot.appendChild(extraStyle);

    const wrap = document.createElement('div');
    wrap.id = 'panel-wrap';
    wrap.innerHTML = `
      <button class="close-btn" id="panel-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      <div class="app-container">
        <header class="app-header">
          <div class="logo">
            <div class="logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
            <h1>PureDown <span>Pro</span></h1>
          </div>
        </header>
        <main class="app-content">
          <section id="state-loading" class="state active">
            <div class="media-card" style="box-shadow:none; border-color:#F2F2F7">
              <div class="skeleton skeleton-thumb"></div>
              <div class="skeleton skeleton-title"></div>
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-btn"></div>
            </div>
            <p style="text-align:center; font-size:11px; color:#AEAEB2; margin-top:12px; font-weight:600">正在分析页面数据...</p>
          </section>
          <section id="state-youtube" class="state">
            <div class="media-card">
              <!-- 锁定水平布局：80px图 + 220px文 -->
              <div style="display: flex; padding: 10px; gap: 10px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7; width: 360px; box-sizing: border-box;">
                <div style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative; background: #000;">
                  <img id="yt-thumb" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                  <div id="yt-type-tag" class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; background: rgba(255,255,255,0.9); color: #000; position: absolute; border-radius: 3px; font-weight: 800;">YT</div>
                </div>
                <div style="width: 240px; min-width: 0;">
                  <h2 id="yt-title" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2>
                  <p id="yt-channel" style="font-size: 10px; margin: 2px 0 0; color: #86868B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></p>
                </div>
              </div>
              <div class="controls" style="padding: 12px;">
                <label class="control-label" style="margin-top: 0;">下载格式</label>
                <div class="segmented-control">
                  <button class="format-btn selected" data-format="mp4">视频 (MP4)</button>
                  <button class="format-btn" data-format="mp3">音频 (MP3)</button>
                </div>
                <label id="quality-label" class="control-label">选择画质</label>
                <div id="quality-grid" class="quality-grid">
                  <button class="quality-btn" data-quality="2160">4K</button>
                  <button class="quality-btn selected" data-quality="1080">1080P</button>
                  <button class="quality-btn" data-quality="720">720P</button>
                  <button class="quality-btn" data-quality="480">480P</button>
                </div>
                <div id="yt-progress-wrap" class="progress-container"><div class="progress-bar"><div id="yt-progress-fill" class="progress-fill"></div></div><p id="yt-progress-label" class="progress-text">准备就绪</p></div>
                <button id="yt-download-btn" class="main-btn">${DOWNLOAD_BTN_HTML}</button>
                <p id="yt-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
          <section id="state-xhs" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div class="thumb-container" style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                  <img id="xhs-thumb" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                  <div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #ff2442;">Red</div>
                </div>
                <div class="media-info" style="flex: 1; min-width: 0;">
                  <h2 id="xhs-title" class="truncate" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F;"></h2>
                  <p id="xhs-author" class="sub-info" style="font-size: 10px; margin-top: 2px; color: #86868B;"></p>
                </div>
              </div>
              <div class="controls" style="padding: 12px;">
                <p id="xhs-status-hint" class="hint-text" style="margin-bottom: 12px;">正在检测媒体资源...</p>
                <div id="xhs-progress-wrap" class="progress-container"><div class="progress-bar"><div id="xhs-progress-fill" class="progress-fill"></div></div><p id="xhs-progress-label" class="progress-text">准备就绪</p></div>
                
                <!-- 三连按钮组 -->
                <div id="xhs-btn-group" style="display: flex; gap: 8px; margin-top: 12px;">
                  <button id="xhs-hd-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0;">高清版视频</button>
                  <button id="xhs-nowm-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0; background:#34C759; box-shadow: 0 4px 12px rgba(52, 199, 89, 0.2);">无水印视频</button>
                  <button id="xhs-all-btn" class="main-btn" style="margin-top:0; flex:1; font-size:10px; padding:10px 0; background:#8E8E93; box-shadow: 0 4px 12px rgba(142, 142, 147, 0.2);">全部视频</button>
                </div>
                <button id="xhs-download-btn" class="main-btn xhs-btn" style="display:none">下载图片</button>
                <p id="xhs-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
          <section id="state-bilibili" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div class="thumb-container" style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                  <img id="bili-thumb" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                  <div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #fb7299; font-weight: bold; background: rgba(255,255,255,0.9); position: absolute; border-radius: 3px;">Bili</div>
                </div>
                <div class="media-info" style="flex: 1; min-width: 0;">
                  <h2 id="bili-title" class="truncate" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2>
                  <p id="bili-author" class="sub-info" style="font-size: 10px; margin-top: 2px; color: #86868B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></p>
                </div>
              </div>
              <div class="controls" style="padding: 12px;">
                <div id="bili-progress-wrap" class="progress-container" style="margin-bottom: 12px;"><div class="progress-bar"><div id="bili-progress-fill" class="progress-fill"></div></div><p id="bili-progress-label" class="progress-text">准备就绪</p></div>
                <button id="bili-download-btn" class="main-btn" style="margin-top:0; width:100%; font-size:12px; padding:12px 0;">${DOWNLOAD_BTN_HTML} (合并版)</button>
                <p id="bili-error-msg" class="error-text"></p>
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
    
    // 小红书按钮绑定
    shadowRoot.getElementById('xhs-hd-btn').onclick = () => startXhsDownload('hd');
    shadowRoot.getElementById('xhs-nowm-btn').onclick = () => startXhsDownload('nowm');
    shadowRoot.getElementById('xhs-all-btn').onclick = () => startXhsDownload('all');
    shadowRoot.getElementById('xhs-download-btn').onclick = () => startXhsDownload('images');
    
    // B站按钮绑定
    if (shadowRoot.getElementById('bili-download-btn')) {
      shadowRoot.getElementById('bili-download-btn').onclick = startBilibiliDownload;
    }
  }

  function togglePanel() {
    panelVisible = !panelVisible;
    const wrap = shadowRoot.getElementById('panel-wrap');
    if (panelVisible) { wrap.classList.add('show'); refreshInfo(); }
    else { wrap.classList.remove('show'); }
  }

  async function refreshInfo() {
    const url = window.location.href;
    const isYT = url.includes('youtube.com/watch') || url.includes('youtube.com/shorts/');
    const isXHS = url.includes('xiaohongshu.com/explore/');
    const isBili = url.includes('bilibili.com/video/');
    shadowRoot.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
    
    if (isYT) {
      initYouTubeUI();
    } else if (isXHS) {
      // 🌟 统一提取与展示逻辑，防止数据竞争
      shadowRoot.getElementById('state-xhs').classList.add('active');
      initXhsUI();
    } else if (isBili) {
      shadowRoot.getElementById('state-bilibili').classList.add('active');
      initBilibiliUI();
    } else {
      shadowRoot.getElementById('state-loading').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>请在视频或笔记详情页使用</p></div>`;
      shadowRoot.getElementById('state-loading').classList.add('active');
    }
  }

  async function initYouTubeUI() {
    const videoIdMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/);
    const id = videoIdMatch?.[1] || videoIdMatch?.[2];
    
    console.log('[PureDown Pro Debug] YT Init - ID:', id);
    if (!id) {
      console.error('[PureDown Pro Debug] YT ID extraction failed');
      return;
    }

    const img = shadowRoot.getElementById('yt-thumb');
    const thumbUrl = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    console.log('[PureDown Pro Debug] YT Thumb URL:', thumbUrl);
    
    img.src = thumbUrl;
    img.onload = () => console.log('[PureDown Pro Debug] YT Thumb loaded');
    img.onerror = () => { 
      console.warn('[PureDown Pro Debug] YT MaxRes failed, using HQ');
      img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; 
    };

    const title = document.title.replace(' - YouTube', '');
    const channel = document.querySelector('#channel-name a')?.textContent || '';
    console.log('[PureDown Pro Debug] YT Metadata:', { title, channel });

    shadowRoot.getElementById('yt-title').textContent = title;
    shadowRoot.getElementById('yt-channel').textContent = channel;
    shadowRoot.getElementById('yt-type-tag').textContent = window.location.href.includes('/shorts/') ? 'Shorts' : 'YT';
    shadowRoot.getElementById('state-youtube').classList.add('active');
  }

  function selectFormat(btn) {
    shadowRoot.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedFormat = btn.dataset.format;
    const showQuality = selectedFormat !== 'mp3';
    shadowRoot.getElementById('quality-grid').style.display = showQuality ? 'grid' : 'none';
    shadowRoot.getElementById('quality-label').style.display = showQuality ? 'block' : 'none';
  }

  function selectQuality(btn) {
    shadowRoot.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedQuality = btn.dataset.quality;
  }

  function startYouTubeDownload() {
    const videoIdMatch = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})|\/shorts\/([a-zA-Z0-9_-]{11})/);
    const id = videoIdMatch?.[1] || videoIdMatch?.[2];
    if (!id) return;
    chrome.runtime.sendMessage({ type: 'START_YT_DOWNLOAD', videoId: id, formatCode: selectedFormat === 'mp3' ? 'mp3' : selectedQuality });
  }

  async function initXhsUI() {
    const title = document.title.replace(/ [-|] 小红书$/, '');
    const author = document.querySelector('.username')?.textContent || 
                   document.querySelector('.author-name')?.textContent || 
                   document.querySelector('.name')?.textContent || '';
    
    const img = shadowRoot.getElementById('xhs-thumb');
    
    // 🌟 重新获取媒体数据以拿到精准封面和类型
    chrome.runtime.sendMessage({ type: 'EXEC_XHS_EXTRACT' }).then(media => {
      let thumbUrl = '';
      
      // 1. 优先使用 background 逻辑精准识别的封面
      const detected = media?.cover;
      
      // 2. 兜底策略
      const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const videoPoster = document.querySelector('video')?.getAttribute('poster');
      const contentImg = Array.from(document.querySelectorAll('img')).find(i => {
        const s = i.src || '';
        return s.startsWith('http') && !/avatar|profile|user/i.test(s) && i.offsetWidth > 100;
      })?.src;

      thumbUrl = detected || ogImg || videoPoster || contentImg || '';
      
      if (thumbUrl) {
        img.style.display = 'block';
        img.src = thumbUrl;
      } else {
        img.style.display = 'none';
      }

      // 🌟 核心：根据资源存在情况动态切换 UI
      const btnGroup = shadowRoot.getElementById('xhs-btn-group');
      const singleBtn = shadowRoot.getElementById('xhs-download-btn');
      const hint = shadowRoot.getElementById('xhs-status-hint');

      const hasVideos = media?.videos && media.videos.length > 0;
      const hasImages = media?.images && media.images.length > 0;

      // 动态显隐：视频有就显示组，图片有就显示大按钮
      btnGroup.style.display = hasVideos ? 'flex' : 'none';
      singleBtn.style.display = hasImages ? 'block' : 'none';

      // 智能合成提示语
      if (hasVideos && hasImages) {
        const vCount = media.videos.length;
        const iCount = media.images.length;
        hint.textContent = `检测到 ${vCount} 个视频资源 & ${iCount} 张笔记图片`;
        singleBtn.style.marginTop = '12px'; 
        singleBtn.textContent = '下载全部高清图片';
      } else if (hasVideos) {
        const vCount = media.videos.length;
        const wmCount = media.videos.filter(v => v.isWatermarked).length;
        hint.textContent = `已检测到 ${vCount} 个视频源 (包含 ${wmCount} 个带水印)`;
      } else if (hasImages) {
        hint.textContent = `已检测到 ${media.images.length} 张笔记图片`;
        singleBtn.textContent = '下载全部高清图片';
      } else {
        hint.textContent = '未检测到可下载媒体';
      }
    });

    shadowRoot.getElementById('xhs-title').textContent = title;
    shadowRoot.getElementById('xhs-author').textContent = author ? `@${author.trim()}` : '';
    shadowRoot.getElementById('state-xhs').classList.add('active');
  }

  async function startXhsDownload(mode) {
    const errorEl = shadowRoot.getElementById('xhs-error-msg');
    const wrap = shadowRoot.getElementById('xhs-progress-wrap');
    errorEl.classList.remove('show');
    wrap.classList.add('show');

    try {
      const media = await chrome.runtime.sendMessage({ type: 'EXEC_XHS_EXTRACT' });
      if (!media) throw new Error('提取失败');

      let urls = [];
      let typeLabel = '视频';

      // 🌟 严格区分模式：只有显式指定为 images 或者是纯图片笔记时才走图片逻辑
      if (mode === 'images') {
        urls = media.images;
        typeLabel = '图片';
      } else {
        const vList = media.videos;
        if (!vList || vList.length === 0) throw new Error('未检测到视频');

        if (mode === 'hd') {
          urls = [vList[0].url];
        } else if (mode === 'nowm') {
          const clean = vList.filter(v => !v.isWatermarked);
          if (clean.length === 0) throw new Error('抱歉，未找到无水印版本');
          urls = [clean[0].url];
        } else if (mode === 'all') {
          urls = vList.map(v => v.url);
        }
      }

      if (urls.length === 0) throw new Error('未检测到可下载的内容');
      chrome.runtime.sendMessage({ type: 'START_XHS_DOWNLOAD', urls, type_label: typeLabel });
    } catch (e) {
      errorEl.textContent = '❌ ' + e.message;
      errorEl.classList.add('show');
    }
  }

  async function initBilibiliUI() {
    const titleMatch = document.title.match(/(.*?)_哔哩哔哩_bilibili/);
    const title = titleMatch ? titleMatch[1] : document.title;
    
    const authorEl = document.querySelector('.up-name') || document.querySelector('.up-info .name');
    const author = authorEl ? authorEl.textContent.trim() : '';

    const img = shadowRoot.getElementById('bili-thumb');
    const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const itemImg = document.querySelector('meta[itemprop="image"]')?.getAttribute('content');
    const thumbUrl = ogImg || itemImg || '';

    if (thumbUrl) {
      img.style.display = 'block';
      img.src = thumbUrl.startsWith('//') ? 'https:' + thumbUrl : thumbUrl;
    } else {
      img.style.display = 'none';
    }

    shadowRoot.getElementById('bili-title').textContent = title;
    shadowRoot.getElementById('bili-author').textContent = author ? `@${author}` : '';
  }

  async function startBilibiliDownload() {
    const errorEl = shadowRoot.getElementById('bili-error-msg');
    const wrap = shadowRoot.getElementById('bili-progress-wrap');
    errorEl.classList.remove('show');
    wrap.classList.add('show');

    try {
      syncTaskUI({ active: true, platform: 'bilibili', progress: 10, text: '正在解析视频地址...', error: '' });
      const mediaUrl = await chrome.runtime.sendMessage({ type: 'EXEC_BILI_EXTRACT' });
      if (!mediaUrl) {
        throw new Error('无法提取到合并版视频链接，可能是该视频强制使用 DASH 格式或需要登录');
      }
      
      // 🌟 核心改进：直接在 B 站页面的上下文中通过 fetch 拉取数据流
      const filename = `bilibili_${Date.now()}.mp4`;
      syncTaskUI({ active: true, platform: 'bilibili', progress: 20, text: '正在建立下载连接...', error: '' });
      
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error(`下载请求失败: ${response.status}`);
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        
        if (total > 0) {
          const progress = Math.min(20 + Math.round((loaded / total) * 75), 99); // 20% 到 95%
          const mbLoaded = (loaded / 1024 / 1024).toFixed(1);
          const mbTotal = (total / 1024 / 1024).toFixed(1);
          syncTaskUI({ active: true, platform: 'bilibili', progress, text: `下载中: ${mbLoaded}MB / ${mbTotal}MB`, error: '' });
        } else {
          const mbLoaded = (loaded / 1024 / 1024).toFixed(1);
          syncTaskUI({ active: true, platform: 'bilibili', progress: 50, text: `下载中: ${mbLoaded}MB...`, error: '' });
        }
      }
      
      syncTaskUI({ active: true, platform: 'bilibili', progress: 98, text: '正在保存文件...', error: '' });
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
      
      syncTaskUI({ active: false, platform: 'bilibili', progress: 100, text: '✅ 下载完成', error: '' });
    } catch (e) {
      console.error('[PureDown Pro] Bilibili download error:', e);
      syncTaskUI({ active: false, platform: 'bilibili', progress: 0, text: '', error: e.message });
    }
  }

  function syncTaskUI(task) {
    let prefix = 'xhs';
    if (task.platform === 'youtube') prefix = 'yt';
    else if (task.platform === 'bilibili') prefix = 'bili';
    
    const btn = shadowRoot.getElementById(`${prefix}-download-btn`);
    const wrap = shadowRoot.getElementById(`${prefix}-progress-wrap`);
    const fill = shadowRoot.getElementById(`${prefix}-progress-fill`);
    const lbl = shadowRoot.getElementById(`${prefix}-progress-label`);
    if (!btn || !wrap) return;

    // 悬浮球反馈
    if (task.active) {
      floatBtn.classList.add('pulse-active');
    } else {
      floatBtn.classList.remove('pulse-active');
    }

    const restoreHTML = prefix === 'xhs' ? '下载全部高清图片' : (prefix === 'bili' ? `${DOWNLOAD_BTN_HTML} (合并版)` : DOWNLOAD_BTN_HTML);

    if (task.error) {
      shadowRoot.getElementById(`${prefix}-error-msg`).textContent = '❌ ' + task.error;
      shadowRoot.getElementById(`${prefix}-error-msg`).classList.add('show');
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = restoreHTML;
    } else if (task.progress === 100) {
      fill.style.width = '100%';
      lbl.textContent = task.text;
      btn.classList.remove('loading');
      btn.style.background = '#34C759'; 
      btn.innerHTML = '✅ 下载已开始';
      setTimeout(() => {
        btn.disabled = false;
        btn.style.background = '';
        btn.innerHTML = restoreHTML;
        wrap.classList.remove('show');
      }, 3000);
    } else {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = `<div class="loader" style="width:14px;height:14px;margin:0;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></div> ${task.progress}% 处理中...`;
      wrap.classList.add('show');
      fill.style.width = task.progress + '%';
      lbl.textContent = task.text;
    }
  }

  init();
})();
