import type {
  HistoryResult,
  SearchRequest,
  SearchResponse,
  SearchResult,
  TabResult
} from '../shared/messages';
import { createGoogleSearchSuggestion } from '../shared/suggestion';

type SendResponse = (response: SearchResponse) => void;
type ChromeApi = Pick<typeof chrome, 'history' | 'runtime' | 'tabs' | 'windows' | 'commands'>;
export type BackgroundChromeApi = {
  history: Pick<typeof chrome.history, 'search'>;
  tabs: Pick<typeof chrome.tabs, 'query' | 'sendMessage' | 'update'>;
  windows: Pick<typeof chrome.windows, 'update'>;
};

type MessageHandlerOptions = {
  fetchGoogleSuggestions?: (query: string, signal: AbortSignal) => Promise<unknown>;
};

export function createMessageHandler(chromeApi: BackgroundChromeApi, options: MessageHandlerOptions = {}) {
  const fetchGoogleSuggestions = options.fetchGoogleSuggestions ?? fetchGoogleSuggestPayload;

  return async (
    message: SearchRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: SendResponse
  ) => {
    try {
      if (message.type === 'QUERY_HISTORY') {
        const historyItems = await chromeApi.history.search({
          text: message.query,
          maxResults: 25,
          startTime: 0
        });

        sendResponse({
          type: 'HISTORY',
          results: historyItems
            .filter((item): item is chrome.history.HistoryItem & { url: string } => Boolean(item.url))
            .map<HistoryResult>((item) => ({
              type: 'history',
              title: item.title || item.url,
              url: item.url,
              visitCount: item.visitCount,
              lastVisitTime: item.lastVisitTime
            }))
        });
        return;
      }

      if (message.type === 'QUERY_TABS') {
        const query = message.query.trim().toLowerCase();
        const queryInfo =
          typeof sender.tab?.windowId === 'number'
            ? { windowId: sender.tab.windowId }
            : { currentWindow: true };
        const tabs = await chromeApi.tabs.query(queryInfo);
        const results = tabs
          .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => Boolean(tab.id && tab.url))
          .filter((tab) => {
            if (!query) {
              return true;
            }

            return (
              (tab.title ?? '').toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
            );
          })
          .slice(0, 25)
          .map<TabResult>((tab) => ({
            type: 'tab',
            tabId: tab.id,
            windowId: tab.windowId,
            title: tab.title || tab.url,
            url: tab.url
          }));

        sendResponse({ type: 'TABS', results });
        return;
      }

      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        const query = message.query.trim();

        if (!query) {
          sendResponse({ type: 'GOOGLE_SUGGESTIONS', results: [] });
          return;
        }

        const abortController = new AbortController();
        const payload = await fetchGoogleSuggestions(query, abortController.signal);
        sendResponse({
          type: 'GOOGLE_SUGGESTIONS',
          results: mapGoogleSuggestPayload(payload)
        });
        return;
      }

      if (message.type === 'NAVIGATE') {
        const tabId = sender.tab?.id;

        if (!tabId) {
          throw new Error('No sender tab available for navigation');
        }

        await chromeApi.tabs.update(tabId, { url: message.url });
        sendResponse({ type: 'NAV_OK' });
        return;
      }

      if (message.type === 'OPEN_TAB') {
        const updatedTab = await chromeApi.tabs.update(message.tabId, { active: true });

        if (updatedTab?.windowId) {
          await chromeApi.windows.update(updatedTab.windowId, { focused: true });
        }

        sendResponse({ type: 'NAV_OK' });
        return;
      }

      sendResponse({ type: 'ERROR', message: `Unsupported message: ${message.type}` });
    } catch (error) {
      sendResponse({
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

async function fetchGoogleSuggestPayload(query: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(
    `https://suggestqueries.google.com/complete/search?hl=en-us&output=chrome&q=${encodeURIComponent(query)}`,
    {
      method: 'GET',
      signal,
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8'
      }
    }
  );

  if (!response.ok) {
    throw new Error(response.statusText || `Google suggestions request failed: ${response.status}`);
  }

  const text = await response.text();
  return JSON.parse(text);
}

function mapGoogleSuggestPayload(payload: unknown): SearchResult[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const suggestions = Array.isArray(payload[1]) ? payload[1] : [];
  const descriptions = Array.isArray(payload[2]) ? payload[2] : [];
  const metadata = payload[4] && typeof payload[4] === 'object' ? payload[4] : {};
  const suggestTypes = Array.isArray((metadata as { ['google:suggesttype']?: unknown })['google:suggesttype'])
    ? ((metadata as { ['google:suggesttype']: string[] })['google:suggesttype'])
    : [];
  const results: SearchResult[] = [];

  for (let index = 0; index < suggestions.length; index += 1) {
    const item = String(suggestions[index] ?? '').trim();
    const suggestType = suggestTypes[index];

    if (!item) {
      continue;
    }

    if (suggestType === 'NAVIGATION') {
      results.push({
        type: 'search',
        title: item,
        description: String(descriptions[index] || '').trim() || undefined,
        url: item
      });
      continue;
    }

    if (suggestType === 'QUERY' || !suggestType) {
      const suggestion = createGoogleSearchSuggestion(item);
      const description = String(descriptions[index] || '').trim();
      results.push(description ? { ...suggestion, description } : suggestion);
    }
  }

  return dedupeSearchResults(results).slice(0, 10);
}

function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function registerBackground(chromeApi: ChromeApi): void {
  const handler = createMessageHandler(chromeApi);

  chromeApi.runtime.onMessage.addListener((message: SearchRequest, sender, sendResponse) => {
    void handler(message, sender, sendResponse);
    return true;
  });

  chromeApi.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-searchbar') {
      return;
    }

    void chromeApi.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) {
        void chromeApi.tabs.sendMessage(tab.id, { type: 'TOGGLE' } satisfies SearchRequest);
      }
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  registerBackground(chrome);
}
