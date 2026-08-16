import { describe, expect, it } from 'vitest';
import { CHROME_PAGES, queryChromePages } from './chrome-pages';

describe('CHROME_PAGES', () => {
  it('includes the planned browser shortcuts', () => {
    const urls = CHROME_PAGES.map((page) => page.url);

    for (const url of [
      'chrome://settings',
      'chrome://extensions',
      'chrome://bookmarks',
      'chrome://history',
      'chrome://downloads',
      'chrome://flags',
      'chrome://inspect',
      'chrome://version',
      'chrome://settings/clearBrowserData',
      'chrome://password-manager/passwords'
    ]) {
      expect(urls).toContain(url);
    }

    // url 就是唯一标识，不允许重复。
    expect(new Set(urls).size).toBe(urls.length);
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

  it('matches tool pages by alias keywords', () => {
    expect(queryChromePages('devtools').map((page) => page.url)).toEqual(['chrome://inspect']);
    expect(queryChromePages('clear cache').map((page) => page.url)).toEqual([
      'chrome://settings/clearBrowserData'
    ]);
    expect(queryChromePages('passwords').map((page) => page.url)).toEqual([
      'chrome://password-manager/passwords'
    ]);
    expect(queryChromePages('webgl').map((page) => page.url)).toEqual(['chrome://gpu']);
  });
});
