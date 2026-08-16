import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { grabFocusFromOmnibox, sendMessageFromExtensionPage } from './main';

describe('sendMessageFromExtensionPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigates the current tab via the tabs API without the service worker', async () => {
    const update = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 5 }), update },
      runtime: { sendMessage }
    });

    const response = await sendMessageFromExtensionPage({ type: 'NAVIGATE', url: 'chrome://settings' });

    expect(update).toHaveBeenCalledWith(5, { url: 'chrome://settings' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(response).toEqual({ type: 'NAV_OK' });
  });

  it('creates new tabs directly and forwards other messages to the background', async () => {
    const create = vi.fn().mockResolvedValue({});
    const sendMessage = vi.fn().mockResolvedValue({ type: 'HISTORY', results: [] });
    vi.stubGlobal('chrome', {
      tabs: { create },
      runtime: { sendMessage }
    });

    await sendMessageFromExtensionPage({ type: 'NAVIGATE', url: 'https://example.com', newTab: true });
    expect(create).toHaveBeenCalledWith({ url: 'https://example.com' });

    await sendMessageFromExtensionPage({ type: 'QUERY_HISTORY', query: 'git' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_HISTORY', query: 'git' });
  });
});

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
