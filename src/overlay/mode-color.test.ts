import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearModeColorCache,
  getDominantColorFromImageData,
  getSearchEngineOrigin,
  requestSearchEngineFaviconDataUrl,
  resolveSearchEngineModeColor
} from './mode-color';

describe('mode color', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearModeColorCache();
  });

  it('requests a favicon data url for the search engine origin', async () => {
    const engine = {
      id: 'github',
      name: 'GitHub',
      keyword: 'gh',
      searchUrl: 'https://github.com/search?q={query}'
    };
    const sendMessage = vi.fn().mockResolvedValue({
      type: 'FAVICON',
      dataUrl: 'data:image/png;base64,AAAA',
      url: 'https://github.com/favicon.ico'
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    expect(getSearchEngineOrigin(engine)).toBe('https://github.com');
    await expect(requestSearchEngineFaviconDataUrl(engine)).resolves.toBe('data:image/png;base64,AAAA');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'QUERY_FAVICON',
      pageUrl: 'https://github.com'
    });
  });

  it('caches favicon data url requests by origin', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      type: 'FAVICON',
      dataUrl: 'data:image/png;base64,AAAA'
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const engine = {
      id: 'custom-gh',
      name: 'GitHub Custom',
      keyword: 'ghc',
      searchUrl: 'https://github.com/search?q={query}'
    };

    await requestSearchEngineFaviconDataUrl(engine);
    await requestSearchEngineFaviconDataUrl(engine);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('uses the most common visible favicon color bucket as a css rgb color', () => {
    const imageData = {
      width: 2,
      height: 2,
      colorSpace: 'srgb',
      data: new Uint8ClampedArray([
        25,
        100,
        200,
        255,
        31,
        110,
        210,
        255,
        255,
        255,
        255,
        255,
        240,
        40,
        40,
        255
      ])
    } as ImageData;

    expect(getDominantColorFromImageData(imageData)).toBe('rgb(28, 105, 205)');
  });

  it('falls back without a color when favicon loading fails', async () => {
    class FailingImage {
      onerror?: () => void;

      set src(_src: string) {
        this.onerror?.();
      }
    }

    vi.stubGlobal('Image', FailingImage);

    await expect(
      resolveSearchEngineModeColor({
        id: 'github',
        name: 'GitHub',
        keyword: 'gh',
        searchUrl: 'https://github.com/search?q={query}'
      })
    ).resolves.toBeUndefined();
  });
});
