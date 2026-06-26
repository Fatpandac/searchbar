import { describe, expect, it, vi } from 'vitest';
import type { Suggestion } from './messages';
import { loadSelectionCounts, recordSelection, reorderBySelection } from './selection-store';

function createStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };

  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    })
  } as unknown as chrome.storage.StorageArea;
}

function search(title: string, url: string): Suggestion {
  return { type: 'search', title, url };
}

describe('selection store', () => {
  it('records and persists a selection count per query+url', async () => {
    const storage = createStorage();
    const counts = {};

    await recordSelection('git', 'https://github.com', counts, storage);
    await recordSelection('git', 'https://github.com', counts, storage);

    const reloaded = await loadSelectionCounts(storage);
    expect(reloaded['git\u0000https://github.com/']).toBe(2);
  });

  it('moves frequently selected suggestions to the front, stable otherwise', () => {
    const counts = {};
    void recordSelection('git', 'https://github.com', counts);

    const ordered = reorderBySelection('git', [search('gitlab', 'https://gitlab.com'), search('github', 'https://github.com')], counts);

    expect(ordered.map((item) => item.url)).toEqual(['https://github.com', 'https://gitlab.com']);
  });

  it('leaves ordering untouched when query is empty', () => {
    const list = [search('a', 'https://a.com'), search('b', 'https://b.com')];
    expect(reorderBySelection('', list, {})).toBe(list);
  });
});
