import type { GoToResult, SearchResult, Suggestion } from './messages';
import { createSearchEngineUrl, type SearchEngine } from './search-engines';

const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_/i];
const URL_LIKE_PATTERN =
  /^(https?:\/\/|chrome:\/\/|file:\/\/|localhost(?::\d+)?(?:\/|$)|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:\/|$))/i;

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith('chrome://')) {
    return trimmed.toLowerCase().replace(/\/$/, '');
  }

  try {
    const parsed = new URL(addProtocolIfNeeded(trimmed));
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString().replace(/\/$/, parsed.pathname === '/' && !parsed.search ? '/' : '');
  } catch {
    return trimmed.toLowerCase();
  }
}

export function shouldCreateGoToSuggestion(query: string): boolean {
  const trimmed = query.trim();
  return URL_LIKE_PATTERN.test(trimmed) && !/\s/.test(trimmed);
}

export function createGoToSuggestion(query: string): GoToResult {
  const trimmed = query.trim();

  return {
    type: 'go',
    title: `Go to ${trimmed}`,
    url: addProtocolIfNeeded(trimmed)
  };
}

export function createGoogleSearchSuggestion(query: string): SearchResult {
  const trimmed = query.trim();

  return {
    type: 'search',
    title: trimmed,
    url: `https://www.google.com/search?q=${encodeQuery(trimmed)}`
  };
}

export function createSearchEngineSuggestion(engine: SearchEngine, query: string): SearchResult {
  const trimmed = query.trim();

  return {
    type: 'search',
    title: trimmed,
    description: `Search ${engine.name}`,
    provider: engine.name,
    url: createSearchEngineUrl(engine, trimmed)
  };
}

export function rankSuggestions<T extends Suggestion>(query: string, suggestions: T[]): T[] {
  const needle = query.trim().toLowerCase();
  const seen = new Set<string>();

  return suggestions
    .map((suggestion, index) => ({ suggestion, index, score: scoreSuggestion(needle, suggestion) }))
    .filter(({ score }) => score > 0 || !needle)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter(({ suggestion }) => {
      const normalized = normalizeUrl(suggestion.url);
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .slice(0, 10)
    .map(({ suggestion }) => suggestion);
}

function addProtocolIfNeeded(value: string): string {
  if (/^(https?:\/\/|chrome:\/\/|file:\/\/)/i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function scoreSuggestion(query: string, suggestion: Suggestion): number {
  if (!query) {
    return suggestion.type === 'chrome' ? 20 : 10;
  }

  const url = suggestion.url.toLowerCase();
  const title = suggestion.title.toLowerCase();
  const comparableUrl = url.replace(/^https?:\/\//, '');
  const compactQuery = compactSearchKey(query);
  let score = scoreTextMatch(query, title, url, comparableUrl);

  if (!score && compactQuery) {
    score = scoreCompactMatch(compactQuery, title, url, comparableUrl);
  }

  if (!score) {
    return 0;
  }

  if (suggestion.type === 'history') {
    score += Math.log((suggestion.visitCount ?? 0) + 1);
    score += recencyBoost(suggestion.lastVisitTime);
  }

  if (suggestion.type === 'chrome') {
    score += 5;
  }

  if (suggestion.type === 'go') {
    score += 1000;
  }

  if (suggestion.type === 'search') {
    score += 900;
  }

  return score;
}

function scoreTextMatch(query: string, title: string, url: string, comparableUrl: string): number {
  if (url.startsWith(query) || comparableUrl.startsWith(query)) {
    return 100;
  }

  if (title.startsWith(query)) {
    return 80;
  }

  if (url.includes(query)) {
    return 60;
  }

  if (title.includes(query)) {
    return 40;
  }

  return 0;
}

function scoreCompactMatch(query: string, title: string, url: string, comparableUrl: string): number {
  const compactTitle = compactSearchKey(title);
  const compactUrl = compactSearchKey(url);
  const compactComparableUrl = compactSearchKey(comparableUrl);

  if (compactUrl.startsWith(query) || compactComparableUrl.startsWith(query)) {
    return 90;
  }

  if (compactTitle.startsWith(query)) {
    return 70;
  }

  if (compactUrl.includes(query)) {
    return 50;
  }

  if (compactTitle.includes(query)) {
    return 30;
  }

  return 0;
}

function compactSearchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function encodeQuery(query: string): string {
  return encodeURIComponent(query).replace(/%20/g, '+');
}

function recencyBoost(lastVisitTime?: number): number {
  if (!lastVisitTime) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - lastVisitTime) / 86_400_000);
  return Math.max(0, 10 - ageDays);
}
