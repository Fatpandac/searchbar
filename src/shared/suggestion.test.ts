import { describe, expect, it } from 'vitest';
import {
  createGoToSuggestion,
  normalizeUrl,
  rankSuggestions,
  shouldCreateGoToSuggestion
} from './suggestion';

describe('normalizeUrl', () => {
  it('deduplicates URLs by lowercasing host and stripping tracking params', () => {
    expect(normalizeUrl('https://Example.com/Path?utm_source=x&b=2&fbclid=abc#section')).toBe(
      'https://example.com/Path?b=2'
    );
  });
});

describe('shouldCreateGoToSuggestion', () => {
  it('accepts domains, absolute URLs, and chrome pages', () => {
    expect(shouldCreateGoToSuggestion('github.com/foo')).toBe(true);
    expect(shouldCreateGoToSuggestion('https://example.com')).toBe(true);
    expect(shouldCreateGoToSuggestion('chrome://settings')).toBe(true);
  });

  it('rejects plain search text', () => {
    expect(shouldCreateGoToSuggestion('github repo search')).toBe(false);
  });
});

describe('createGoToSuggestion', () => {
  it('normalizes domain-like input to https navigation', () => {
    expect(createGoToSuggestion('github.com/foo')).toMatchObject({
      type: 'go',
      title: 'Go to github.com/foo',
      url: 'https://github.com/foo'
    });
  });
});

describe('rankSuggestions', () => {
  it('prioritizes exact URL prefixes, title prefixes, URL contains, and title contains', () => {
    const ranked = rankSuggestions('git', [
      { type: 'history', title: 'Docs', url: 'https://example.com/git', visitCount: 1 },
      { type: 'history', title: 'GitHub', url: 'https://code.example.com', visitCount: 1 },
      { type: 'history', title: 'Learning Git', url: 'https://learn.example.com', visitCount: 1 },
      { type: 'history', title: 'Code', url: 'https://gitlab.com', visitCount: 1 }
    ]);

    expect(ranked.map((item) => item.url)).toEqual([
      'https://gitlab.com',
      'https://code.example.com',
      'https://example.com/git',
      'https://learn.example.com'
    ]);
  });

  it('deduplicates normalized URLs and returns at most ten suggestions', () => {
    const ranked = rankSuggestions('example', [
      {
        type: 'history',
        title: 'Original',
        url: 'https://example.com/?utm_source=a',
        visitCount: 1
      },
      { type: 'history', title: 'Duplicate', url: 'https://EXAMPLE.com/', visitCount: 99 },
      ...Array.from({ length: 12 }, (_, index) => ({
        type: 'history' as const,
        title: `Example ${index}`,
        url: `https://example-${index}.com`,
        visitCount: 1
      }))
    ]);

    expect(ranked).toHaveLength(10);
    expect(ranked.filter((item) => normalizeUrl(item.url) === 'https://example.com/')).toHaveLength(1);
  });

  it('matches history titles when the query omits word separators', () => {
    const ranked = rankSuggestions('hackernews', [
      { type: 'history', title: 'GitHub', url: 'https://github.com', visitCount: 99 },
      { type: 'history', title: 'Hacker News', url: 'https://news.ycombinator.com', visitCount: 1 }
    ]);

    expect(ranked.map((item) => item.title)).toEqual(['Hacker News']);
  });

  it('does not return unrelated history entries just because they have visits', () => {
    const ranked = rankSuggestions('hackernews', [
      { type: 'history', title: 'GitHub', url: 'https://github.com', visitCount: 99 }
    ]);

    expect(ranked).toEqual([]);
  });
});
