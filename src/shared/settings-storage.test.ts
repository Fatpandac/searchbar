import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPEN_TARGET,
  DEFAULT_VIM_MODE,
  getDefaultOpenTarget,
  getVimMode,
  saveDefaultOpenTarget,
  saveVimMode
} from './settings-storage';

function createStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };

  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    })
  } as unknown as chrome.storage.StorageArea;
}

describe('settings storage', () => {
  it('loads the saved default open target', async () => {
    const storage = createStorage({ searchbarDefaultOpenTarget: 'newTab' });

    expect(await getDefaultOpenTarget(storage)).toBe('newTab');
  });

  it('falls back to the current tab target for invalid stored values', async () => {
    const storage = createStorage({ searchbarDefaultOpenTarget: 'sidePanel' });

    expect(await getDefaultOpenTarget(storage)).toBe(DEFAULT_OPEN_TARGET);
  });

  it('saves the default open target', async () => {
    const storage = createStorage();

    await saveDefaultOpenTarget('newTab', storage);

    expect(storage.set).toHaveBeenCalledWith({ searchbarDefaultOpenTarget: 'newTab' });
  });

  it('loads the saved vim mode and falls back for invalid values', async () => {
    expect(await getVimMode(createStorage({ searchbarVimMode: false }))).toBe(false);
    expect(await getVimMode(createStorage({ searchbarVimMode: 'yes' }))).toBe(DEFAULT_VIM_MODE);
    expect(await getVimMode(createStorage())).toBe(DEFAULT_VIM_MODE);
  });

  it('saves the vim mode', async () => {
    const storage = createStorage();

    await saveVimMode(false, storage);

    expect(storage.set).toHaveBeenCalledWith({ searchbarVimMode: false });
  });
});
