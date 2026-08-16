export type DefaultOpenTarget = 'currentTab' | 'newTab';

export const DEFAULT_OPEN_TARGET: DefaultOpenTarget = 'currentTab';
export const DEFAULT_OPEN_TARGET_KEY = 'searchbarDefaultOpenTarget';

// 默认开启：Ctrl+J/K 移动选中是已有行为，选项只给遇到快捷键冲突的人关掉。
export const DEFAULT_VIM_MODE = true;
export const VIM_MODE_KEY = 'searchbarVimMode';

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

export async function getVimMode(storage = getDefaultStorage()): Promise<boolean> {
  if (!storage) {
    return DEFAULT_VIM_MODE;
  }

  const result = await storage.get(VIM_MODE_KEY);
  const value = result[VIM_MODE_KEY];

  return typeof value === 'boolean' ? value : DEFAULT_VIM_MODE;
}

export async function saveVimMode(enabled: boolean, storage = getDefaultStorage()): Promise<void> {
  if (!storage) {
    return;
  }

  await storage.set({ [VIM_MODE_KEY]: enabled });
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
