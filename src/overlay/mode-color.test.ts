import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSearchEngineFaviconUrl,
  getDominantColorFromImageData,
  getSearchEngineOrigin,
  resolveSearchEngineModeColor
} from './mode-color';

describe('mode color', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the search engine origin as the favicon page url', () => {
    const engine = {
      id: 'github',
      name: 'GitHub',
      keyword: 'gh',
      searchUrl: 'https://github.com/search?q={query}'
    };

    expect(getSearchEngineOrigin(engine)).toBe('https://github.com');
    expect(createSearchEngineFaviconUrl(engine)).toBe(
      `chrome://favicon2/?size=32&pageUrl=${encodeURIComponent('https://github.com')}`
    );
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
