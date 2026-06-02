import { describe, expect, it } from 'vitest';
import { CHROME_PAGES, queryChromePages } from './chrome-pages';

describe('CHROME_PAGES', () => {
  it('includes the planned browser shortcuts', () => {
    expect(CHROME_PAGES.map((page) => page.url)).toEqual([
      'chrome://settings',
      'chrome://extensions',
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
      'chrome://extensions'
    ]);
    expect(queryChromePages('experiments').map((page) => page.url)).toEqual(['chrome://flags']);
  });
});
