// ================================================================
// 视频下载器 Pro - Popup Settings & Status
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle-btn');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  // 1. 从存储加载初始状态
  chrome.storage.local.get(['showFloatBtn'], (res) => {
    toggle.checked = res.showFloatBtn !== false;
  });

  // 2. 检测当前页面状态
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url || '';
    
    if (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts/')) {
      updateStatus(true, '已检测到 YouTube 视频');
    } else if (url.includes('xiaohongshu.com/explore/')) {
      updateStatus(true, '已检测到小红书笔记');
    } else if (url.includes('youtube.com') || url.includes('xiaohongshu.com')) {
      updateStatus(false, '请进入视频详情页使用');
    } else {
      updateStatus(false, '当前页面不支持下载');
    }
  } catch (e) {
    updateStatus(false, '无法获取页面信息');
  }

  function updateStatus(active, text) {
    statusText.textContent = text;
    if (active) {
      statusDot.classList.add('active');
    } else {
      statusDot.classList.remove('active');
    }
  }

  // 3. 监听开关切换
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ showFloatBtn: enabled });
    
    // 通知当前活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_FLOAT_BTN', 
          enabled: enabled 
        }).catch(() => {});
      }
    });
  });
});
