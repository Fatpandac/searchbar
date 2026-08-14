import { describe, expect, it } from 'vitest';
import { hasGitHubSearch, queryGitHub } from './github';

const respond = (results: unknown[]) =>
  (async () => ({
    ok: true,
    json: async () => ({ payload: { blackbirdSearchRoute: { results } } })
  })) as unknown as typeof fetch;

describe('github site search', () => {
  it('只在 github.com 上启用', () => {
    expect(hasGitHubSearch({ hostname: 'github.com' })).toBe(true);
    expect(hasGitHubSearch({ hostname: 'example.com' })).toBe(false);
  });

  it('同源请求搜索页的 JSON 分支', async () => {
    let seen: [string, RequestInit | undefined] | null = null;
    const spy = (async (url: string, init?: RequestInit) => {
      seen = [url, init];
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await queryGitHub('a b', spy);

    expect(seen![0]).toBe('https://github.com/search?type=repositories&q=a%20b');
    expect(seen![1]?.credentials).toBe('same-origin');
  });

  it('剥掉高亮标签和 HTML 实体', async () => {
    const results = await queryGitHub(
      'preact',
      respond([
        {
          hl_name: 'preactjs/<em>preact</em>',
          hl_trunc_description: 'Fast 3kB React alternative. Components &amp; Virtual DOM.',
          followers: 38816,
          language: 'JavaScript',
          repo: { repository: { name: 'preact', owner_login: 'preactjs' } }
        },
        { hl_name: 'broken', repo: {} }
      ])
    );

    expect(results).toEqual([
      {
        type: 'search',
        title: 'preactjs/preact',
        url: 'https://github.com/preactjs/preact',
        description: '★ 38816 · JavaScript · Fast 3kB React alternative. Components & Virtual DOM.',
        provider: 'GitHub'
      }
    ]);
  });

  it('失败时静默返回空', async () => {
    const denied = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await queryGitHub('denied', denied)).toEqual([]);

    const broken = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await queryGitHub('offline', broken)).toEqual([]);
  });

  it('空 query 不发请求', async () => {
    const boom = (() => {
      throw new Error('should not fetch');
    }) as unknown as typeof fetch;
    expect(await queryGitHub('   ', boom)).toEqual([]);
  });
});
