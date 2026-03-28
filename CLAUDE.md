# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Chrome 浏览器扩展（Manifest V3），用于从 YouTube、YouTube Shorts 和小红书下载视频/图片。

## 架构概览

```
├── manifest.json       # 扩展配置（Manifest V3）
├── background.js       # Service Worker，处理下载核心逻辑
├── content.js          # 页面注入脚本，创建浮动按钮和面板 UI
├── content.css         # 注入样式
├── popup.html/js/css   # 扩展弹窗设置页面（悬浮球开关）
└── icons/              # 插件图标
```

## 消息通信流程

1. **content.js** (页面注入) → **background.js** (Service Worker)
   - 监听用户点击，通过 `chrome.runtime.sendMessage` 发送任务请求
   - 接收状态更新，同步 UI 进度

2. **background.js** 处理逻辑：
   - YouTube: 调用 loader.to API 进行视频转换和下载
   - 小红书: 使用 `chrome.scripting.executeScript` 在 MAIN world 执行 `extractXhsMedia()` 提取 CDN 原始链接

## 关键实现细节

### 小红书媒体提取
由于 content script 无法直接访问页面 MAIN world 的 `window.__INITIAL_STATE__`，提取逻辑放在 background.js 中通过 `world: 'MAIN'` 执行脚本。

### 浮动按钮
- 位置存储在 `chrome.storage.local` (`floatBtnBottom`)
- 使用 MutationObserver 守护防止被网页动态重写

### 样式隔离
content.js 使用 Shadow DOM 挂载面板，样式通过 `chrome.runtime.getURL('popup.css')` 加载。

## 开发说明

- 无需构建工具，直接修改源文件后重新加载扩展即可测试
- 调试：在 Chrome 扩展管理页开启"开发者模式"，点击"service worker"的检查链接查看 background.js 日志
- 页面注入脚本通过 Chrome 开发者工具 Console 查看 content.js 日志