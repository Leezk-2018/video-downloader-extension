// ================================================================
// 视频下载器 Pro - Popup 设置与状态
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle-btn');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  chrome.storage.local.get(['showFloatBtn'], (res) => {
    toggle.checked = res.showFloatBtn !== false;
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    const hostname = getHostname(url);

    const supportedPages = [
      {
        siteName: 'YouTube',
        mediaName: 'YouTube 视频',
        isSupportedDomain: () => hostname.includes('youtube.com'),
        isSupportedPage: () => hostname.includes('youtube.com') && (url.includes('v=') || url.includes('/shorts/'))
      },
      {
        siteName: '小红书',
        mediaName: '小红书笔记',
        isSupportedDomain: () => hostname.includes('xiaohongshu.com'),
        isSupportedPage: () => hostname.includes('xiaohongshu.com') && (url.includes('/explore/') || url.includes('/discovery/item/'))
      },
      {
        siteName: 'Bilibili',
        mediaName: 'Bilibili 视频',
        isSupportedDomain: () => hostname.includes('bilibili.com'),
        isSupportedPage: () => hostname.includes('bilibili.com') && url.includes('/video/')
      },
      {
        siteName: '抖音',
        mediaName: '抖音视频',
        isSupportedDomain: () => hostname.includes('douyin.com'),
        isSupportedPage: () => hostname.includes('douyin.com') && (url.includes('/video/') || url.includes('modal_id=') || url.includes('/note/'))
      }
    ];

    const matchedPage = supportedPages.find((item) => item.isSupportedPage());
    if (matchedPage) {
      updateStatus(true, `已检测到${matchedPage.mediaName}`);
    } else {
      const matchedDomain = supportedPages.find((item) => item.isSupportedDomain());
      if (matchedDomain) {
        updateStatus(false, `当前为 ${matchedDomain.siteName} 站点，请进入具体视频详情页后使用`);
      } else {
        updateStatus(false, '当前页面暂不支持下载');
      }
    }
  } catch (e) {
    updateStatus(false, '无法获取当前页面信息');
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return '';
    }
  }

  function updateStatus(active, text) {
    statusText.textContent = text;
    if (active) {
      statusDot.classList.add('active');
    } else {
      statusDot.classList.remove('active');
    }
  }

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ showFloatBtn: enabled });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TOGGLE_FLOAT_BTN',
          enabled
        }).catch(() => {});
      }
    });
  });
});
