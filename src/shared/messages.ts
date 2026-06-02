export type SuggestionKind = 'go' | 'chrome' | 'history' | 'tab' | 'search';

export type HistoryResult = {
  type: 'history';
  title: string;
  url: string;
  visitCount?: number;
  lastVisitTime?: number;
};

export type TabResult = {
  type: 'tab';
  tabId: number;
  windowId?: number;
  title: string;
  url: string;
};

export type ChromePageResult = {
  type: 'chrome';
  title: string;
  url: string;
  keywords: string[];
};

export type GoToResult = {
  type: 'go';
  title: string;
  url: string;
};

export type SearchResult = {
  type: 'search';
  title: string;
  url: string;
  description?: string;
};

export type Suggestion = HistoryResult | TabResult | ChromePageResult | GoToResult | SearchResult;

export type SearchRequest =
  | { type: 'QUERY_TABS'; query: string }
  | { type: 'QUERY_HISTORY'; query: string }
  | { type: 'QUERY_GOOGLE_SUGGESTIONS'; query: string }
  | { type: 'NAVIGATE'; url: string }
  | { type: 'OPEN_TAB'; tabId: number }
  | { type: 'TOGGLE' };

export type SearchResponse =
  | { type: 'TABS'; results: TabResult[] }
  | { type: 'HISTORY'; results: HistoryResult[] }
  | { type: 'GOOGLE_SUGGESTIONS'; results: SearchResult[] }
  | { type: 'NAV_OK' }
  | { type: 'ERROR'; message: string };
