// ================================================================
// 视频下载器 Pro - Popup Settings Logic
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-btn');
  
  // 1. 从存储加载初始状态
  chrome.storage.local.get(['showFloatBtn'], (res) => {
    // 默认为 true
    toggle.checked = res.showFloatBtn !== false;
    console.log('[VD-PRO] Settings loaded:', toggle.checked);
  });

  // 2. 监听开关切换
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    
    // 保存到本地存储
    chrome.storage.local.set({ showFloatBtn: enabled }, () => {
      console.log('[VD-PRO] Settings saved:', enabled);
    });
    
    // 通知当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_FLOAT_BTN', 
          enabled: enabled 
        }).catch(err => {
          // 忽略在非匹配页面发送消息导致的错误
          console.log('[VD-PRO] Tab notification skipped (not a supported page)');
        });
      }
    });
  });
});
