import type { ChromePageResult } from './messages';

export const CHROME_PAGES: ChromePageResult[] = [
  {
    type: 'chrome',
    url: 'chrome://settings',
    title: 'Settings',
    keywords: ['settings', 'prefs']
  },
  {
    type: 'chrome',
    url: 'chrome://extensions',
    title: 'Extensions',
    keywords: ['extensions', 'addons', 'plugins']
  },
  {
    type: 'chrome',
    url: 'chrome://extensions/shortcuts',
    title: 'Extensions Shortcuts',
    keywords: ['extensions', 'shortcuts', 'plugins', 'plugin settings']
  },
  {
    type: 'chrome',
    url: 'chrome://bookmarks',
    title: 'Bookmarks',
    keywords: ['bookmarks']
  },
  {
    type: 'chrome',
    url: 'chrome://history',
    title: 'History',
    keywords: ['history']
  },
  {
    type: 'chrome',
    url: 'chrome://downloads',
    title: 'Downloads',
    keywords: ['downloads']
  },
  {
    type: 'chrome',
    url: 'chrome://flags',
    title: 'Flags',
    keywords: ['flags', 'experiments']
  },
  {
    type: 'chrome',
    url: 'chrome://newtab',
    title: 'New Tab',
    keywords: ['newtab']
  },
  // 开发 / 调试工具页。扩展 API 打不开真正的 DevTools 面板，chrome://inspect 是最近的入口。
  {
    type: 'chrome',
    url: 'chrome://inspect',
    title: 'Inspect Devices',
    keywords: ['devtools', 'inspect', 'debug', 'remote debugging']
  },
  {
    type: 'chrome',
    url: 'chrome://version',
    title: 'Version',
    keywords: ['version', 'user agent', 'command line']
  },
  {
    type: 'chrome',
    url: 'chrome://gpu',
    title: 'GPU',
    keywords: ['gpu', 'graphics', 'webgl', 'hardware acceleration']
  },
  {
    type: 'chrome',
    url: 'chrome://net-internals',
    title: 'Net Internals',
    keywords: ['net', 'network', 'dns', 'sockets', 'proxy']
  },
  {
    type: 'chrome',
    url: 'chrome://net-export',
    title: 'Net Export',
    keywords: ['network log', 'net export', 'capture']
  },
  {
    type: 'chrome',
    url: 'chrome://webrtc-internals',
    title: 'WebRTC Internals',
    keywords: ['webrtc', 'peer connection']
  },
  {
    type: 'chrome',
    url: 'chrome://serviceworker-internals',
    title: 'Service Worker Internals',
    keywords: ['service worker', 'sw', 'workers']
  },
  {
    type: 'chrome',
    url: 'chrome://components',
    title: 'Components',
    keywords: ['components', 'widevine', 'updates']
  },
  {
    type: 'chrome',
    url: 'chrome://system',
    title: 'System Info',
    keywords: ['system', 'diagnostics', 'about system']
  },
  {
    type: 'chrome',
    url: 'chrome://crashes',
    title: 'Crashes',
    keywords: ['crashes', 'crash reports']
  },
  // 常用设置子路由，命令面板真正的价值所在。
  // 注意：这些路由随 Chrome 版本变动（如 settings/passwords 已迁到 password-manager），
  // 失效后果只是落到 settings 首页，可接受。
  {
    type: 'chrome',
    url: 'chrome://settings/clearBrowserData',
    title: 'Clear Browsing Data',
    keywords: ['clear cache', 'clear data', 'clear history', 'clear cookies']
  },
  {
    type: 'chrome',
    url: 'chrome://password-manager/passwords',
    title: 'Password Manager',
    keywords: ['passwords', 'credentials', 'logins']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/cookies',
    title: 'Cookies Settings',
    keywords: ['cookies', 'site data', 'tracking']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/searchEngines',
    title: 'Search Engines',
    keywords: ['search engines', 'default search']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/payments',
    title: 'Payment Methods',
    keywords: ['payments', 'credit cards', 'autofill']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/addresses',
    title: 'Addresses',
    keywords: ['addresses', 'autofill']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/content',
    title: 'Site Settings',
    keywords: ['permissions', 'camera', 'microphone', 'notifications', 'location']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/privacy',
    title: 'Privacy and Security',
    keywords: ['privacy', 'security', 'safe browsing']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/appearance',
    title: 'Appearance',
    keywords: ['appearance', 'theme', 'font', 'zoom']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/languages',
    title: 'Languages',
    keywords: ['languages', 'translate', 'spell check']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/downloads',
    title: 'Downloads Settings',
    keywords: ['download location', 'downloads settings']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/accessibility',
    title: 'Accessibility',
    keywords: ['accessibility', 'captions', 'cursor']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/system',
    title: 'System Settings',
    keywords: ['proxy', 'hardware acceleration', 'startup']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/reset',
    title: 'Reset Settings',
    keywords: ['reset', 'restore defaults', 'cleanup']
  },
  {
    type: 'chrome',
    url: 'chrome://settings/help',
    title: 'About Chrome',
    keywords: ['about', 'update chrome', 'chrome version']
  },
  // 其他
  {
    type: 'chrome',
    url: 'chrome://apps',
    title: 'Apps',
    keywords: ['apps', 'applications']
  },
  {
    type: 'chrome',
    url: 'chrome://whats-new',
    title: "What's New",
    keywords: ['whats new', 'release notes']
  },
  {
    type: 'chrome',
    url: 'chrome://dino',
    title: 'Dino Game',
    keywords: ['dino', 'game', 'offline']
  }
];

export function queryChromePages(query: string): ChromePageResult[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return CHROME_PAGES;
  }

  return CHROME_PAGES.filter((page) => {
    return (
      page.title.toLowerCase().includes(needle) ||
      page.url.toLowerCase().includes(needle) ||
      page.keywords.some((keyword) => keyword.includes(needle))
    );
  });
}
