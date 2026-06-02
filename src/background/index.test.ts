import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BackgroundChromeApi, createMessageHandler, findIconHref } from './index';

const chromeApi = () => ({
  history: {
    search: vi.fn()
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    update: vi.fn()
  },
  windows: {
    update: vi.fn()
  }
});

const asBackgroundApi = (api: ReturnType<typeof chromeApi>): BackgroundChromeApi =>
  api as unknown as BackgroundChromeApi;

describe('createMessageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries history with requested text and returns history results', async () => {
    const api = chromeApi();
    api.history.search.mockResolvedValue([
      {
        title: 'GitHub',
        url: 'https://github.com',
        visitCount: 3,
        lastVisitTime: 100
      }
    ]);
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))({ type: 'QUERY_HISTORY', query: 'git' }, {}, sendResponse);

    expect(api.history.search).toHaveBeenCalledWith({
      text: 'git',
      maxResults: 25,
      startTime: 0
    });
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'HISTORY',
      results: [
        {
          type: 'history',
          title: 'GitHub',
          url: 'https://github.com',
          visitCount: 3,
          lastVisitTime: 100
        }
      ]
    });
  });

  it('queries tabs in the sender window and filters tabs by title or URL', async () => {
    const api = chromeApi();
    api.tabs.query.mockResolvedValue([
      { id: 1, windowId: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, windowId: 1, title: 'Docs', url: 'https://example.com' }
    ]);
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'QUERY_TABS', query: 'git' },
      { tab: { windowId: 4 } as chrome.tabs.Tab },
      sendResponse
    );

    expect(api.tabs.query).toHaveBeenCalledWith({ windowId: 4 });
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'TABS',
      results: [
        {
          type: 'tab',
          tabId: 1,
          windowId: 1,
          title: 'GitHub',
          url: 'https://github.com'
        }
      ]
    });
  });

  it('queries Google autosuggestions and maps query and navigation results', async () => {
    const api = chromeApi();
    const sendResponse = vi.fn();
    const fetchGoogleSuggestions = vi.fn().mockResolvedValue([
      'rea',
      ['react hooks', 'https://react.dev/'],
      ['React Hooks', 'React'],
      [],
      {
        'google:suggesttype': ['QUERY', 'NAVIGATION']
      }
    ]);

    await createMessageHandler(asBackgroundApi(api), { fetchGoogleSuggestions })(
      { type: 'QUERY_GOOGLE_SUGGESTIONS', query: 'rea' },
      {},
      sendResponse
    );

    expect(fetchGoogleSuggestions).toHaveBeenCalledWith('rea', expect.any(AbortSignal));
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'GOOGLE_SUGGESTIONS',
      results: [
        {
          type: 'search',
          title: 'react hooks',
          description: 'React Hooks',
          url: 'https://www.google.com/search?q=react+hooks'
        },
        {
          type: 'search',
          title: 'https://react.dev/',
          description: 'React',
          url: 'https://react.dev/'
        }
      ]
    });
  });

  it('fetches a favicon data url for a page origin', async () => {
    const api = chromeApi();
    const sendResponse = vi.fn();
    const fetchFavicon = vi.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,AAAA',
      url: 'https://github.com/favicon.ico'
    });

    await createMessageHandler(asBackgroundApi(api), { fetchFavicon })(
      { type: 'QUERY_FAVICON', pageUrl: 'https://github.com' },
      {},
      sendResponse
    );

    expect(fetchFavicon).toHaveBeenCalledWith('https://github.com', expect.any(AbortSignal));
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'FAVICON',
      dataUrl: 'data:image/png;base64,AAAA',
      url: 'https://github.com/favicon.ico'
    });
  });

  it('uses the fast favicon endpoint before discovering icons from page html', async () => {
    const api = chromeApi();
    const sendResponse = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer)
    });
    vi.stubGlobal('fetch', fetch);

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'QUERY_FAVICON', pageUrl: 'https://github.com' },
      {},
      sendResponse
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent('https://github.com')}&sz=64`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FAVICON',
        dataUrl: 'data:image/png;base64,AQID'
      })
    );
  });

  it('extracts icon hrefs from page html', () => {
    expect(
      findIconHref(`
        <link rel="preconnect" href="https://assets.example.com">
        <link href="/apple.png" rel="apple-touch-icon">
        <link rel="icon" type="image/png" href="/favicon.png">
      `)
    ).toBe('/favicon.png');
  });

  it('navigates the sender tab when no tab id is supplied', async () => {
    const api = chromeApi();
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'NAVIGATE', url: 'chrome://settings' },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse
    );

    expect(api.tabs.update).toHaveBeenCalledWith(7, { url: 'chrome://settings' });
    expect(sendResponse).toHaveBeenCalledWith({ type: 'NAV_OK' });
  });

  it('opens a matched tab and focuses its window', async () => {
    const api = chromeApi();
    api.tabs.update.mockResolvedValue({ windowId: 9 });
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))({ type: 'OPEN_TAB', tabId: 3 }, {}, sendResponse);

    expect(api.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect(api.windows.update).toHaveBeenCalledWith(9, { focused: true });
    expect(sendResponse).toHaveBeenCalledWith({ type: 'NAV_OK' });
  });
});
