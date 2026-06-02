import type { SearchEngine } from '../shared/search-engines';

const DEFAULT_FAVICON_SIZE = 32;
const MIN_ALPHA = 16;
const MAX_CHANNEL_VALUE = 245;
const COLOR_BUCKET_SIZE = 24;

export async function resolveSearchEngineModeColor(engine: SearchEngine | null): Promise<string | undefined> {
  if (!engine) {
    return undefined;
  }

  const faviconUrl = createSearchEngineFaviconUrl(engine);
  if (!faviconUrl) {
    return undefined;
  }

  try {
    return await extractDominantColorFromImage(faviconUrl);
  } catch {
    return undefined;
  }
}

export function createSearchEngineFaviconUrl(engine: SearchEngine): string | undefined {
  const origin = getSearchEngineOrigin(engine);
  if (!origin) {
    return undefined;
  }

  return `chrome://favicon2/?size=${DEFAULT_FAVICON_SIZE}&pageUrl=${encodeURIComponent(origin)}`;
}

export function getSearchEngineOrigin(engine: SearchEngine): string | undefined {
  try {
    return new URL(engine.searchUrl).origin;
  } catch {
    return undefined;
  }
}

export function getDominantColorFromImageData(imageData: ImageData): string | undefined {
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number }>();

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const alpha = imageData.data[index + 3];

    if (
      alpha < MIN_ALPHA ||
      (red > MAX_CHANNEL_VALUE && green > MAX_CHANNEL_VALUE && blue > MAX_CHANNEL_VALUE)
    ) {
      continue;
    }

    const key = [
      Math.floor(red / COLOR_BUCKET_SIZE),
      Math.floor(green / COLOR_BUCKET_SIZE),
      Math.floor(blue / COLOR_BUCKET_SIZE)
    ].join(':');
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant) {
    return undefined;
  }

  return `rgb(${Math.round(dominant.red / dominant.count)}, ${Math.round(
    dominant.green / dominant.count
  )}, ${Math.round(
    dominant.blue / dominant.count
  )})`;
}

async function extractDominantColorFromImage(src: string): Promise<string | undefined> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  const size = DEFAULT_FAVICON_SIZE;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    return undefined;
  }

  try {
    context.drawImage(image, 0, 0, size, size);
    return getDominantColorFromImageData(context.getImageData(0, 0, size, size));
  } catch {
    return undefined;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load favicon'));
    image.src = src;
  });
}
