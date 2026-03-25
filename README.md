# 视频下载器 Pro

> 一款开源的 Chrome 浏览器插件，支持 YouTube、YouTube Shorts、小红书视频一键下载，无需登录，无广告。

![版本](https://img.shields.io/badge/版本-v2.0-red) ![平台](https://img.shields.io/badge/平台-Chrome-blue) ![协议](https://img.shields.io/badge/协议-MIT-green)

---

## ✨ 功能特性

| 平台 | 支持内容 |
|------|---------|
| YouTube | 普通视频，支持 4K / 1080p / 720p / 480p 画质选择 |
| YouTube Shorts | 短视频下载 |
| YouTube（音频）| 提取 MP3 音频 |
| 小红书 | 视频笔记无水印下载 |
| 小红书 | 图文笔记批量图片下载 |

---

## 📦 安装方法

> Chrome 应用商店版本正在审核中，目前请使用开发者模式手动安装。

**第一步**：下载本仓库（Code → Download ZIP），解压到一个固定文件夹

**第二步**：打开 Chrome 扩展管理页

```
chrome://extensions/
```

**第三步**：打开右上角「**开发者模式**」

**第四步**：点击「**加载已解压的扩展程序**」，选择解压后的文件夹（含 `manifest.json`）

**第五步**：完成！工具栏出现插件图标即安装成功

---

## 🚀 使用说明

### YouTube / Shorts

1. 打开任意 YouTube 视频或 Shorts 页面
2. 点击浏览器工具栏中的插件图标
3. 选择格式（MP4 / MP3）和画质
4. 点击「**立即下载**」，等待转换完成后自动保存

> ⏱ 视频转换由 [loader.to](https://loader.to) 提供，长视频最多等待 10 分钟

### 小红书

1. 在小红书网页版打开一篇**具体笔记**（URL 格式为 `xiaohongshu.com/explore/{ID}`）
2. 点击插件图标
3. 点击「**下载视频 / 图片**」

> 📌 不支持首页、搜索页、个人主页，请进入具体笔记页再使用

---

## 🔧 工作原理

### YouTube
通过 [loader.to](https://loader.to) 开放 API 解析视频并提供下载链接，无需 API Key。

### 小红书
通过 Chrome Scripting API 在**页面主上下文（MAIN world）**执行注入脚本，从 `window.__INITIAL_STATE__` 中精准提取当前笔记的媒体数据（CDN 原始链接），多策略兜底：

1. 解析 `window.__INITIAL_STATE__`（按笔记 ID 精准定位）
2. 读取 `<video>` 标签
3. 正则扫描 `<script>` 内容
4. 读取已渲染的 `<img>` 大图

提取到的视频链接指向小红书 CDN 源文件，**天然无水印**。

---

## 🗂 文件结构

```
├── manifest.json      # 插件配置（Manifest V3）
├── popup.html         # 弹窗 UI
├── popup.js           # 主逻辑
├── content.js         # 页面注入脚本（辅助）
├── content.css        # 注入样式
├── icons/             # 插件图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## ❓ 常见问题

**Q：YouTube 下载失败？**
A：部分视频受版权或地区限制，可尝试切换画质后重试。

**Q：小红书提示「未能提取到媒体内容」？**
A：请确认：① 笔记页面已完全加载 ② 视频笔记请先点击播放后再下载 ③ 刷新页面重试

**Q：小红书下载了多个视频？**
A：部分笔记本身包含多个视频片段，每个片段会独立下载，属于正常行为。

**Q：支持其他平台吗？**
A：目前支持 YouTube 和小红书。后续计划支持 Bilibili、抖音等平台，欢迎提 Issue 或 PR。

---

## ⚠️ 免责声明

本工具仅供个人学习和研究使用。请勿将下载内容用于商业用途，下载前请确认你有权访问相关内容。使用本工具产生的任何法律责任由用户自行承担。

---

## 📄 License

[MIT](LICENSE)
