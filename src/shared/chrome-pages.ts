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
