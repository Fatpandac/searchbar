import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BackgroundChromeApi, createMessageHandler } from './index';

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
