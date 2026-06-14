export type DefaultOpenTarget = 'currentTab' | 'newTab';

export const DEFAULT_OPEN_TARGET: DefaultOpenTarget = 'currentTab';
export const DEFAULT_OPEN_TARGET_KEY = 'searchbarDefaultOpenTarget';

type StorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

export async function getDefaultOpenTarget(storage = getDefaultStorage()): Promise<DefaultOpenTarget> {
  if (!storage) {
    return DEFAULT_OPEN_TARGET;
  }

  const result = await storage.get(DEFAULT_OPEN_TARGET_KEY);
  const value = result[DEFAULT_OPEN_TARGET_KEY];

  return isDefaultOpenTarget(value) ? value : DEFAULT_OPEN_TARGET;
}

export async function saveDefaultOpenTarget(
  target: DefaultOpenTarget,
  storage = getDefaultStorage()
): Promise<void> {
  if (!storage) {
    return;
  }

  await storage.set({ [DEFAULT_OPEN_TARGET_KEY]: target });
}

function getDefaultStorage(): StorageArea | undefined {
  if (typeof chrome === 'undefined') {
    return undefined;
  }

  return chrome.storage?.sync;
}

function isDefaultOpenTarget(value: unknown): value is DefaultOpenTarget {
  return value === 'currentTab' || value === 'newTab';
}
