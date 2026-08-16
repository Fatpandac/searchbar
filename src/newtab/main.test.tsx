import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { grabFocusFromOmnibox } from './main';

describe('grabFocusFromOmnibox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDoc(hasFocus: () => boolean) {
    const focus = vi.fn();
    const doc = {
      hasFocus,
      querySelector: () => ({ focus })
    } as unknown as Document;

    return { doc, focus };
  }

  it('keeps focusing the input until the page owns focus', () => {
    let focused = false;
    const { doc, focus } = createDoc(() => focused);

    grabFocusFromOmnibox(doc, 1000, 50);

    vi.advanceTimersByTime(150);
    expect(focus).toHaveBeenCalledTimes(3);

    focused = true;
    vi.advanceTimersByTime(500);
    expect(focus).toHaveBeenCalledTimes(3);
  });

  it('gives up after the timeout when the omnibox keeps focus', () => {
    const { doc, focus } = createDoc(() => false);

    grabFocusFromOmnibox(doc, 200, 50);

    vi.advanceTimersByTime(2000);
    expect(focus.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
