import { describe, expect, it } from 'vitest';
import { CHROME_PAGES, queryChromePages } from './chrome-pages';

describe('CHROME_PAGES', () => {
  it('includes the planned browser shortcuts', () => {
    expect(CHROME_PAGES.map((page) => page.url)).toEqual([
      'chrome://settings',
      'chrome://extensions',
      'chrome://extensions/shortcuts',
      'chrome://bookmarks',
      'chrome://history',
      'chrome://downloads',
      'chrome://flags',
      'chrome://newtab'
    ]);
  });
});

describe('queryChromePages', () => {
  it('matches by title, url, and keyword', () => {
    expect(queryChromePages('prefs').map((page) => page.url)).toEqual(['chrome://settings']);
    expect(queryChromePages('chrome://ext').map((page) => page.url)).toEqual([
      'chrome://extensions',
      'chrome://extensions/shortcuts'
    ]);
    expect(queryChromePages('experiments').map((page) => page.url)).toEqual(['chrome://flags']);
    expect(queryChromePages('plugin settings').map((page) => page.url)).toEqual([
      'chrome://extensions/shortcuts'
    ]);
  });
});
