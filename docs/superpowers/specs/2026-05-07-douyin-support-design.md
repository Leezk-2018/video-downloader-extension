# 2026-05-07 Douyin Support Design

## 1. 目标 (Goal)
为 PureDown Pro 插件扩展抖音 (www.douyin.com) 视频下载支持。支持提取无水印视频地址，并参考 Bilibili 的下载方式，通过内容脚本 (Content Script) 进行 fetch 下载以绕过防盗链限制。

## 2. 核心架构 (Architecture)

### 2.1 数据提取 (Data Extraction)
*   **位置**: `background.js` 中的 `extractDouyinMedia` 函数（运行在页面的 MAIN world）。
*   **原理**: 抖音网页版将数据存储在 `id="RENDER_DATA"` 的 `<script>` 标签中。
*   **逻辑**:
    1.  获取 `document.getElementById('RENDER_DATA').textContent`。
    2.  进行 `decodeURIComponent` 处理。
    3.  解析为 JSON 对象。
    4.  深度递归搜索包含 `playAddr` 的字段。
    5.  **无水印化**: 将找到的 URL 中的 `playwm` 替换为 `play`。

### 2.2 下载机制 (Download Mechanism)
*   **方式**: 参照 Bilibili 实现，在 `content.js` 中直接 fetch。
*   **优点**: 利用当前页面的 Context（Referer, Cookie, User-Agent），无视服务端防盗链。
*   **流程**:
    1.  用户点击下载。
    2.  `content.js` 发起消息请求后台提取数据。
    3.  获取到 URL 后，在 `content.js` 中执行 `fetch(url)`。
    4.  读取 `response.body.getReader()` 流。
    5.  实时更新 UI 进度条。
    6.  合并所有 chunks 为 `Blob`。
    7.  通过虚拟 `<a>` 标签触发下载。

### 2.3 UI/UX 设计
*   **面板状态**: 新增 `state-douyin` 模块。
*   **视觉风格**:
    *   主色调: `#000000` (背景), `#25F4EE` (青色), `#FE2C55` (洋红)。
    *   展示内容: 视频封面、标题、下载进度条、"下载无水印视频"按钮。

## 3. 修改计划 (Action Plan)

### 3.1 `manifest.json`
*   添加 `https://www.douyin.com/*` 到 `host_permissions`。
*   在 `content_scripts` 的 `matches` 中加入 `https://www.douyin.com/*`。

### 3.2 `content.js`
*   更新 `isSupportedPage()`。
*   更新 `refreshInfo()` 逻辑，识别抖音 URL。
*   新增 `initDouyinUI()`：负责渲染抖音视频信息。
*   新增 `startDouyinDownload()`：实现流式 fetch 下载。
*   更新 `syncTaskUI()`：支持 `prefix = 'dy'`。

### 3.3 `background.js`
*   消息监听器新增 `EXEC_DOUYIN_EXTRACT`。
*   新增 `handleDouyinExtract()`。
*   新增 `extractDouyinMedia()` (注入函数)。

### 3.4 `popup.css`
*   新增 `.state-douyin` 相关样式。
*   定义抖音品牌色变量。

## 4. 异常处理 (Error Handling)
*   **解析失败**: 若 `RENDER_DATA` 结构改变，尝试降级使用 `video` 标签的 `src`。
*   **下载超时**: 设置 fetch 超时逻辑，并在 UI 提示重试。
*   **内存溢出**: 针对超长视频，提示用户使用普通下载模式（如果有）。

## 5. 验证标准 (Validation)
*   在抖音单个视频详情页能弹出下载面板。
*   能正确获取视频封面和标题。
*   下载后的视频文件无抖音水印。
*   下载过程中进度条平滑移动。
