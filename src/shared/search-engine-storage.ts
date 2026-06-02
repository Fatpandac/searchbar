import { mergeSearchEngines, type SearchEngine } from './search-engines';

export const CUSTOM_SEARCH_ENGINES_KEY = 'searchbarCustomSearchEngines';

type StorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

export async function getCustomSearchEngines(storage = getDefaultStorage()): Promise<SearchEngine[]> {
  if (!storage) {
    return [];
  }

  const result = await storage.get(CUSTOM_SEARCH_ENGINES_KEY);
  const value = result[CUSTOM_SEARCH_ENGINES_KEY];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isSearchEngine);
}

export async function saveCustomSearchEngines(
  engines: SearchEngine[],
  storage = getDefaultStorage()
): Promise<void> {
  if (!storage) {
    return;
  }

  await storage.set({ [CUSTOM_SEARCH_ENGINES_KEY]: engines });
}

export async function loadSearchEngines(storage = getDefaultStorage()): Promise<SearchEngine[]> {
  return mergeSearchEngines(await getCustomSearchEngines(storage));
}

function getDefaultStorage(): StorageArea | undefined {
  if (typeof chrome === 'undefined') {
    return undefined;
  }

  return chrome.storage?.sync;
}

function isSearchEngine(value: unknown): value is SearchEngine {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const engine = value as SearchEngine;

  return (
    typeof engine.id === 'string' &&
    typeof engine.name === 'string' &&
    typeof engine.keyword === 'string' &&
    typeof engine.searchUrl === 'string' &&
    engine.name.trim().length > 0 &&
    engine.keyword.trim().length > 0 &&
    engine.searchUrl.includes('{query}')
  );
}
