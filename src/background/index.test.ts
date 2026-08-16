import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BackgroundChromeApi, createMessageHandler, createNewTabRedirect, findIconHref } from './index';

const chromeApi = () => ({
  history: {
    search: vi.fn()
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
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

  it('falls back to local history matching when a compact query omits title separators', async () => {
    const api = chromeApi();
    api.history.search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          title: 'GitHub',
          url: 'https://github.com',
          visitCount: 99,
          lastVisitTime: 100
        },
        {
          title: 'Hacker News',
          url: 'https://news.ycombinator.com',
          visitCount: 3,
          lastVisitTime: 200
        }
      ]);
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))({ type: 'QUERY_HISTORY', query: 'hackernews' }, {}, sendResponse);

    expect(api.history.search).toHaveBeenNthCalledWith(1, {
      text: 'hackernews',
      maxResults: 25,
      startTime: 0
    });
    expect(api.history.search).toHaveBeenNthCalledWith(2, {
      text: '',
      maxResults: 200,
      startTime: 0
    });
    expect(sendResponse).toHaveBeenCalledWith({
      type: 'HISTORY',
      results: [
        {
          type: 'history',
          title: 'Hacker News',
          url: 'https://news.ycombinator.com',
          visitCount: 3,
          lastVisitTime: 200
        }
      ]
    });
  });

  it('queries tabs in the sender window and fuzzy matches tabs by title or URL', async () => {
    const api = chromeApi();
    api.tabs.query.mockResolvedValue([
      { id: 1, windowId: 1, title: 'Project Documentation', url: 'https://docs.example.com' },
      { id: 2, windowId: 1, title: 'Docs', url: 'https://example.com' }
    ]);
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'QUERY_TABS', query: 'pjdoc' },
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
          title: 'Project Documentation',
          url: 'https://docs.example.com'
        }
      ]
    });
  });

  it('returns all matching tabs without truncating to 25 results', async () => {
    const api = chromeApi();
    api.tabs.query.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        title: `Tab ${index + 1}`,
        url: `https://tab-${index + 1}.example.com`
      }))
    );
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'QUERY_TABS', query: '' },
      { tab: { windowId: 4 } as chrome.tabs.Tab },
      sendResponse
    );

    const response = sendResponse.mock.calls[0]?.[0];
    expect(response).toMatchObject({ type: 'TABS' });
    expect(response.results).toHaveLength(30);
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

  it('opens navigation in a new tab when requested', async () => {
    const api = chromeApi();
    const sendResponse = vi.fn();

    await createMessageHandler(asBackgroundApi(api))(
      { type: 'NAVIGATE', url: 'https://example.com', newTab: true },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse
    );

    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(api.tabs.update).not.toHaveBeenCalled();
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

  it('replaces only new tab pages with an extension-created tab', async () => {
    const create = vi.fn().mockResolvedValue({ id: 99 });
    const remove = vi.fn();
    const redirect = createNewTabRedirect({ create, remove }, (path) => `chrome-extension://abc/${path}`);

    redirect({ id: 1, index: 4, windowId: 7, pendingUrl: 'chrome://newtab/' });
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/src/newtab/index.html',
      index: 4,
      windowId: 7
    });
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalledWith(1);
    });

    create.mockClear();
    redirect({ id: 2, index: 0, windowId: 7, pendingUrl: 'https://example.com/' });
    redirect({ id: 3, index: 0, windowId: 7, url: 'https://example.com/' });
    redirect({ index: 0, windowId: 7, pendingUrl: 'chrome://newtab/' });
    expect(create).not.toHaveBeenCalled();
  });
});
