import { describe, expect, it, vi } from 'vitest';
import { getCustomSearchEngines, loadSearchEngines, saveCustomSearchEngines } from './search-engine-storage';

function createStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };

  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    })
  } as unknown as chrome.storage.StorageArea;
}

describe('search engine storage', () => {
  it('loads custom engines from storage and merges them with built-ins', async () => {
    const storage = createStorage({
      searchbarCustomSearchEngines: [
        {
          id: 'custom-linear',
          name: 'Linear',
          keyword: 'li',
          searchUrl: 'https://linear.app/search?q={query}'
        }
      ]
    });

    const engines = await loadSearchEngines(storage);

    expect(engines[0].name).toBe('Linear');
    expect(engines.find((engine) => engine.keyword === 'gh')?.name).toBe('GitHub');
  });

  it('ignores invalid custom engines', async () => {
    const storage = createStorage({
      searchbarCustomSearchEngines: [
        { id: 'missing-url', name: 'Broken', keyword: 'b' },
        { id: 'valid', name: 'Valid', keyword: 'v', searchUrl: 'https://example.com?q={query}' }
      ]
    });

    expect(await getCustomSearchEngines(storage)).toEqual([
      { id: 'valid', name: 'Valid', keyword: 'v', searchUrl: 'https://example.com?q={query}' }
    ]);
  });

  it('saves custom engines', async () => {
    const storage = createStorage();
    const engines = [{ id: 'custom', name: 'Custom', keyword: 'c', searchUrl: 'https://c.test?q={query}' }];

    await saveCustomSearchEngines(engines, storage);

    expect(storage.set).toHaveBeenCalledWith({ searchbarCustomSearchEngines: engines });
  });
});
