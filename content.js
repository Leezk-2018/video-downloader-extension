// content.js - 注入到 YouTube 页面，用于辅助获取信息
// 此文件目前主要作为桥接使用，popup 通过 scripting API 直接执行函数

// 可选：监听页面变化（YouTube 是单页应用）
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // 页面切换时通知 background（如有需要可扩展）
  }
}).observe(document, { subtree: true, childList: true });
