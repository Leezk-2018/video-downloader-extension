# Douyin Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 PureDown Pro 插件扩展抖音 (www.douyin.com) 视频下载支持，提取无水印视频并支持流式下载。

**Architecture:** 
1. 在 `background.js` 中通过注入 `MAIN` world 脚本从 `RENDER_DATA` 提取视频数据。
2. 在 `content.js` 中使用 `fetch` 方式下载视频流并保存为 `Blob`。
3. 扩展 UI 以展示抖音视频信息和下载进度。

**Tech Stack:** JavaScript (Chrome Extension V3), Fetch API, CSS.

---

### Task 1: 更新 Manifest 权限

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: 添加抖音域名权限**
修改 `manifest.json`，在 `host_permissions` 和 `content_scripts.matches` 中添加抖音域名。

```json
{
  "host_permissions": [
    ...
    "https://www.douyin.com/*"
  ],
  "content_scripts": [
    {
      "matches": [
        ...
        "https://www.douyin.com/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ]
}
```

- [ ] **Step 2: 验证权限更新**
检查 `manifest.json` 语法是否正确。

- [ ] **Step 3: Commit**
```bash
git add manifest.json
git commit -m "chore: add douyin host permissions to manifest"
```

### Task 2: 实现后台提取逻辑 (Background Extractor)

**Files:**
- Modify: `background.js`

- [ ] **Step 1: 添加消息监听器分支**
在 `chrome.runtime.onMessage.addListener` 中添加对 `EXEC_DOUYIN_EXTRACT` 的处理。

```javascript
  // ... existing code ...
  else if (message.type === 'EXEC_BILI_EXTRACT') {
    handleBiliExtract(sender.tab.id).then(sendResponse);
    return true;
  } else if (message.type === 'EXEC_DOUYIN_EXTRACT') {
    handleDouyinExtract(sender.tab.id).then(sendResponse);
    return true;
  }
```

- [ ] **Step 2: 实现 `handleDouyinExtract` 函数**
编写后台处理函数，注入 `extractDouyinMedia` 到页面。

```javascript
async function handleDouyinExtract(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractDouyinMedia,
      world: 'MAIN',
    });
    return res?.result;
  } catch (e) {
    console.error('[BG] Douyin Extract Error:', e);
    return null;
  }
}
```

- [ ] **Step 3: 实现 `extractDouyinMedia` 注入函数**
实现从 `RENDER_DATA` 提取视频地址和标题的逻辑。

```javascript
function extractDouyinMedia() {
  try {
    const renderData = document.getElementById('RENDER_DATA')?.textContent;
    if (!renderData) return null;
    
    const data = JSON.parse(decodeURIComponent(renderData));
    
    // 递归搜索包含 playAddr 的对象
    let videoData = null;
    let title = document.title;
    
    function findVideo(obj) {
      if (!obj || videoData) return;
      if (typeof obj !== 'object') return;
      
      if (obj.playAddr && obj.cover) {
        videoData = {
          url: obj.playAddr.replace('playwm', 'play'), // 无水印
          cover: obj.cover,
          title: title
        };
        return;
      }
      
      for (let k in obj) {
        findVideo(obj[k]);
      }
    }
    
    findVideo(data);
    return videoData;
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 4: Commit**
```bash
git add background.js
git commit -m "feat: implement douyin extraction logic in background"
```

### Task 3: 扩展内容脚本 UI (Content UI)

**Files:**
- Modify: `content.js`
- Modify: `popup.css`

- [ ] **Step 1: 更新 `isSupportedPage`**
添加抖音域名的识别。

```javascript
  function isSupportedPage() {
    const url = window.location.href;
    const isYT = url.includes('youtube.com/watch') || url.includes('youtube.com/shorts/');
    const isXHS = url.includes('xiaohongshu.com/explore/');
    const isBili = url.includes('bilibili.com/video/');
    const isDouyin = url.includes('douyin.com/');
    return isYT || isXHS || isBili || isDouyin;
  }
```

- [ ] **Step 2: 在 `createPanel` 中添加 `state-douyin` HTML**
在 `shadowRoot` 的面板 HTML 中增加抖音状态位。

```javascript
          <section id="state-douyin" class="state">
            <div class="media-card">
              <div style="display: flex; padding: 12px; gap: 12px; align-items: center; border-bottom: 0.5px solid #E5E5EA; background: #F5F5F7;">
                <div class="thumb-container" style="width: 80px; height: 45px; flex-shrink: 0; border-radius: 6px; overflow: hidden; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                  <img id="dy-thumb" src="" alt="" style="width: 100%; height: 100%; object-fit: cover;">
                  <div class="type-tag" style="font-size: 7px; padding: 1px 4px; top: 2px; right: 2px; color: #FE2C55; font-weight: bold; background: rgba(255,255,255,0.9); position: absolute; border-radius: 3px;">DY</div>
                </div>
                <div class="media-info" style="flex: 1; min-width: 0;">
                  <h2 id="dy-title" class="truncate" style="font-size: 12px; margin: 0; line-height: 1.2; color: #1D1D1F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;"></h2>
                  <p id="dy-author" class="sub-info" style="font-size: 10px; margin-top: 2px; color: #86868B;">@抖音视频</p>
                </div>
              </div>
              <div class="controls" style="padding: 12px;">
                <div id="dy-progress-wrap" class="progress-container" style="margin-bottom: 12px;"><div class="progress-bar"><div id="dy-progress-fill" class="progress-fill"></div></div><p id="dy-progress-label" class="progress-text">准备就绪</p></div>
                <button id="dy-download-btn" class="main-btn" style="margin-top:0; width:100%; font-size:12px; padding:12px 0;">${DOWNLOAD_BTN_HTML} (无水印)</button>
                <p id="dy-error-msg" class="error-text"></p>
              </div>
            </div>
          </section>
```

- [ ] **Step 3: 绑定下载按钮事件**
在 `createPanel` 结尾绑定点击事件。

```javascript
    if (shadowRoot.getElementById('dy-download-btn')) {
      shadowRoot.getElementById('dy-download-btn').onclick = startDouyinDownload;
    }
```

- [ ] **Step 4: 实现 `initDouyinUI` 和更新 `refreshInfo`**
处理抖音页面的信息初始化。

```javascript
  // 修改 refreshInfo
  async function refreshInfo() {
    const url = window.location.href;
    // ... isYT, isXHS, isBili ...
    const isDouyin = url.includes('douyin.com/');
    shadowRoot.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
    
    if (isYT) {
      initYouTubeUI();
    } else if (isXHS) {
      shadowRoot.getElementById('state-xhs').classList.add('active');
      initXhsUI();
    } else if (isBili) {
      shadowRoot.getElementById('state-bilibili').classList.add('active');
      initBilibiliUI();
    } else if (isDouyin) {
      shadowRoot.getElementById('state-douyin').classList.add('active');
      initDouyinUI();
    } else {
      // ... empty state ...
    }
  }

  async function initDouyinUI() {
    const media = await chrome.runtime.sendMessage({ type: 'EXEC_DOUYIN_EXTRACT' });
    if (media) {
      shadowRoot.getElementById('dy-title').textContent = media.title || document.title;
      const img = shadowRoot.getElementById('dy-thumb');
      img.src = media.cover || '';
      img.style.display = media.cover ? 'block' : 'none';
    }
  }
```

- [ ] **Step 5: Commit**
```bash
git add content.js
git commit -m "feat: add douyin UI to content script"
```

### Task 4: 实现流式下载逻辑 (Fetch Downloader)

**Files:**
- Modify: `content.js`

- [ ] **Step 1: 实现 `startDouyinDownload`**
参照 Bilibili 的下载逻辑实现 fetch + stream 处理。

```javascript
  async function startDouyinDownload() {
    const errorEl = shadowRoot.getElementById('dy-error-msg');
    const wrap = shadowRoot.getElementById('dy-progress-wrap');
    errorEl.classList.remove('show');
    wrap.classList.add('show');

    try {
      syncTaskUI({ active: true, platform: 'douyin', progress: 10, text: '正在解析无水印地址...', error: '' });
      const media = await chrome.runtime.sendMessage({ type: 'EXEC_DOUYIN_EXTRACT' });
      if (!media || !media.url) throw new Error('无法提取到视频地址');
      
      const filename = `douyin_${Date.now()}.mp4`;
      syncTaskUI({ active: true, platform: 'douyin', progress: 20, text: '正在建立连接...', error: '' });
      
      const response = await fetch(media.url);
      if (!response.ok) throw new Error(`请求失败: ${response.status}`);
      
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
          const progress = Math.min(20 + Math.round((loaded / total) * 75), 99);
          syncTaskUI({ active: true, platform: 'douyin', progress, text: `下载中: ${(loaded / 1024 / 1024).toFixed(1)}MB`, error: '' });
        }
      }
      
      syncTaskUI({ active: true, platform: 'douyin', progress: 98, text: '正在合并文件...', error: '' });
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
      
      syncTaskUI({ active: false, platform: 'douyin', progress: 100, text: '✅ 下载完成', error: '' });
    } catch (e) {
      syncTaskUI({ active: false, platform: 'douyin', progress: 0, text: '', error: e.message });
    }
  }
```

- [ ] **Step 2: 更新 `syncTaskUI` 以支持 `douyin` 前缀**
在 `syncTaskUI` 中映射 `douyin` 到 `dy`。

```javascript
  function syncTaskUI(task) {
    let prefix = 'xhs';
    if (task.platform === 'youtube') prefix = 'yt';
    else if (task.platform === 'bilibili') prefix = 'bili';
    else if (task.platform === 'douyin') prefix = 'dy';
    // ... rest of the logic ...
  }
```

- [ ] **Step 3: Commit**
```bash
git add content.js
git commit -m "feat: implement streaming download for douyin"
```

### Task 5: 样式润色与验证

**Files:**
- Modify: `popup.css`

- [ ] **Step 1: 添加抖音品牌色和相关样式**
在 `popup.css` 中添加抖音的视觉定义。

```css
/* Douyin Specific */
#state-douyin .main-btn {
  background: linear-gradient(135deg, #FE2C55, #25F4EE);
  box-shadow: 0 4px 12px rgba(254, 44, 85, 0.2);
}
#state-douyin .type-tag {
  color: #FE2C55 !important;
}
```

- [ ] **Step 2: 最终检查**
确保所有文件修改符合 UTF-8 无 BOM 格式。

- [ ] **Step 3: Commit**
```bash
git add popup.css
git commit -m "style: add douyin brand colors"
```
