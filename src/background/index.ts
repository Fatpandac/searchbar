import { Fzf } from 'fzf';
import type {
  HistoryResult,
  SearchRequest,
  SearchResponse,
  SearchResult,
  TabResult
} from '../shared/messages';
import { createGoogleSearchSuggestion, rankSuggestions } from '../shared/suggestion';

type SendResponse = (response: SearchResponse) => void;
type ChromeApi = Pick<typeof chrome, 'history' | 'runtime' | 'tabs' | 'windows' | 'commands'>;
type QueryableTab = chrome.tabs.Tab & { id: number; url: string };
export type BackgroundChromeApi = {
  history: Pick<typeof chrome.history, 'search'>;
  tabs: Pick<typeof chrome.tabs, 'query' | 'sendMessage' | 'update' | 'create'>;
  windows: Pick<typeof chrome.windows, 'update'>;
};

type MessageHandlerOptions = {
  fetchGoogleSuggestions?: (query: string, signal: AbortSignal) => Promise<unknown>;
  fetchFavicon?: (pageUrl: string, signal: AbortSignal) => Promise<FaviconPayload | undefined>;
};

type FaviconPayload = {
  dataUrl: string;
  url: string;
};

const HISTORY_SEARCH_MAX_RESULTS = 25;
const HISTORY_FALLBACK_MAX_RESULTS = 200;

export function createMessageHandler(chromeApi: BackgroundChromeApi, options: MessageHandlerOptions = {}) {
  const fetchGoogleSuggestions = options.fetchGoogleSuggestions ?? fetchGoogleSuggestPayload;
  const fetchFavicon = options.fetchFavicon ?? fetchFaviconPayload;

  return async (
    message: SearchRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: SendResponse
  ) => {
    try {
      if (message.type === 'QUERY_HISTORY') {
        const query = message.query.trim();
        const historyItems = await chromeApi.history.search({
          text: query,
          maxResults: HISTORY_SEARCH_MAX_RESULTS,
          startTime: 0
        });
        const fallbackHistoryItems =
          historyItems.length === 0 && shouldSearchRecentHistoryFallback(query)
            ? await chromeApi.history.search({
                text: '',
                maxResults: HISTORY_FALLBACK_MAX_RESULTS,
                startTime: 0
              })
            : [];
        const results = mapHistoryItems([...historyItems, ...fallbackHistoryItems]);

        sendResponse({
          type: 'HISTORY',
          results: fallbackHistoryItems.length > 0 ? rankSuggestions(query, results) : results
        });
        return;
      }

      if (message.type === 'QUERY_TABS') {
        const query = message.query.trim();
        const queryInfo =
          typeof sender.tab?.windowId === 'number'
            ? { windowId: sender.tab.windowId }
            : { currentWindow: true };
        const tabs = await chromeApi.tabs.query(queryInfo);
        const queryableTabs = tabs
          .filter((tab): tab is QueryableTab => Boolean(tab.id && tab.url));
        const results = queryTabs(queryableTabs, query)
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

      if (message.type === 'QUERY_FAVICON') {
        const abortController = new AbortController();
        const favicon = await fetchFavicon(message.pageUrl, abortController.signal);
        sendResponse({
          type: 'FAVICON',
          dataUrl: favicon?.dataUrl,
          url: favicon?.url
        });
        return;
      }

      if (message.type === 'NAVIGATE') {
        if (message.newTab) {
          await chromeApi.tabs.create({ url: message.url });
          sendResponse({ type: 'NAV_OK' });
          return;
        }

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

function mapHistoryItems(historyItems: chrome.history.HistoryItem[]): HistoryResult[] {
  return historyItems
    .filter((item): item is chrome.history.HistoryItem & { url: string } => Boolean(item.url))
    .map<HistoryResult>((item) => ({
      type: 'history',
      title: item.title || item.url,
      url: item.url,
      visitCount: item.visitCount,
      lastVisitTime: item.lastVisitTime
    }));
}

function shouldSearchRecentHistoryFallback(query: string): boolean {
  return query.length >= 4 && /^[a-z0-9]+$/i.test(query);
}

function queryTabs(tabs: QueryableTab[], query: string): QueryableTab[] {
  if (!query) {
    return tabs;
  }

  return new Fzf(tabs, { selector: selectorForTab }).find(query).map((entry) => entry.item);
}

function selectorForTab(tab: QueryableTab): string {
  return `${tab.title ?? ''} ${tab.url}`;
}

async function fetchFaviconPayload(pageUrl: string, signal: AbortSignal): Promise<FaviconPayload | undefined> {
  const origin = getOrigin(pageUrl);
  if (!origin) {
    return undefined;
  }

  const candidates = [createFastFaviconUrl(origin), new URL('/favicon.ico', origin).href].filter(
    (url): url is string => Boolean(url)
  );
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    const dataUrl = await fetchImageAsDataUrl(candidate, signal);
    if (dataUrl) {
      return { dataUrl, url: candidate };
    }
  }

  const discoveredUrl = await discoverFaviconUrl(origin, signal);
  if (discoveredUrl && !seen.has(discoveredUrl)) {
    const dataUrl = await fetchImageAsDataUrl(discoveredUrl, signal);
    if (dataUrl) {
      return { dataUrl, url: discoveredUrl };
    }
  }

  return undefined;
}

function createFastFaviconUrl(origin: string): string {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(origin)}&sz=64`;
}

async function discoverFaviconUrl(origin: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const response = await fetch(origin, { method: 'GET', signal });
    if (!response.ok) {
      return undefined;
    }

    const iconHref = findIconHref(await response.text());
    return iconHref ? new URL(iconHref, origin).href : undefined;
  } catch {
    return undefined;
  }
}

export function findIconHref(html: string): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const iconLinks = links
    .map((link) => ({
      rel: getHtmlAttribute(link, 'rel')?.toLowerCase() ?? '',
      href: getHtmlAttribute(link, 'href')
    }))
    .filter((link): link is { rel: string; href: string } => Boolean(link.href && link.rel.includes('icon')));

  return (
    iconLinks.find((link) => link.rel.split(/\s+/).includes('icon'))?.href ??
    iconLinks.find((link) => link.rel.includes('shortcut'))?.href ??
    iconLinks[0]?.href
  );
}

function getHtmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtmlAttribute(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function decodeHtmlAttribute(value: string | undefined): string | undefined {
  return value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchImageAsDataUrl(url: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const response = await fetch(url, { method: 'GET', signal });
    if (!response.ok) {
      return undefined;
    }

    const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const contentType =
      !headerContentType || headerContentType === 'application/octet-stream'
        ? inferImageMimeType(url)
        : headerContentType;

    if (!contentType.startsWith('image/')) {
      return undefined;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:${contentType};base64,${uint8ToBase64(bytes)}`;
  } catch {
    return undefined;
  }
}

function inferImageMimeType(url: string): string {
  const pathname = getUrlPathname(url).toLowerCase();
  if (pathname.endsWith('.png')) {
    return 'image/png';
  }

  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (pathname.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (pathname.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/x-icon';
}

function getUrlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function getOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
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

// Cmd+T 建的空白标签页里 omnibox 独占键盘焦点，页面 focus() 抢不走（Chrome 特意保护，
// 重定向也没用）。由扩展自己 create 的标签页焦点才落在页面内容上，
// 所以用新建一个同位置标签页 + 关掉原标签页来替换。
export function createNewTabRedirect(
  tabs: Pick<typeof chrome.tabs, 'create' | 'remove'>,
  getURL: (path: string) => string
) {
  return (tab: Pick<chrome.tabs.Tab, 'id' | 'pendingUrl' | 'url' | 'index' | 'windowId'>) => {
    if (tab.id === undefined || (tab.pendingUrl ?? tab.url) !== 'chrome://newtab/') {
      return;
    }

    const originalTabId = tab.id;
    void tabs
      .create({ url: getURL('src/newtab/index.html'), index: tab.index, windowId: tab.windowId })
      .then(() => tabs.remove(originalTabId));
  };
}

export function registerBackground(chromeApi: ChromeApi): void {
  const handler = createMessageHandler(chromeApi);

  chromeApi.tabs.onCreated.addListener(
    createNewTabRedirect(chromeApi.tabs, (path) => chromeApi.runtime.getURL(path))
  );

  chromeApi.runtime.onMessage.addListener((message: SearchRequest, sender, sendResponse) => {
    void handler(message, sender, sendResponse);
    return true;
  });

  // Handle keyboard shortcuts (both primary and alternative)
  chromeApi.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-searchbar' && command !== 'toggle-searchbar-alt') {
      return;
    }

    void chromeApi.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) {
        void chromeApi.tabs.sendMessage(tab.id, { type: 'TOGGLE' } satisfies SearchRequest);
      }
    });
  });

  // Handle extension icon click as fallback activation method
  if (chromeApi.runtime.onMessage && typeof chrome !== 'undefined' && chrome.action) {
    chrome.action.onClicked.addListener((tab) => {
      if (tab?.id) {
        void chromeApi.tabs.sendMessage(tab.id, { type: 'TOGGLE' } satisfies SearchRequest);
      }
    });
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  registerBackground(chrome);
}
