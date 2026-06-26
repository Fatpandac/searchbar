import type { Suggestion } from './messages';
import { normalizeUrl } from './suggestion';

const SELECTION_COUNTS_KEY = 'searchbarSelectionCounts';
// ponytail: cap stored entries; drop least-selected when over. Raise if users hit it.
const MAX_ENTRIES = 1000;

export type SelectionCounts = Record<string, number>;

type StorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

export function selectionKey(query: string, url: string): string {
  return `${query.trim().toLowerCase()}\u0000${normalizeUrl(url)}`;
}

export async function loadSelectionCounts(storage = getStorage()): Promise<SelectionCounts> {
  if (!storage) {
    return {};
  }

  const result = await storage.get(SELECTION_COUNTS_KEY);
  const value = result[SELECTION_COUNTS_KEY];

  return isCounts(value) ? value : {};
}

export async function recordSelection(
  query: string,
  url: string,
  counts: SelectionCounts,
  storage = getStorage()
): Promise<void> {
  if (!query.trim()) {
    return;
  }

  const key = selectionKey(query, url);
  counts[key] = (counts[key] ?? 0) + 1;

  if (storage) {
    await storage.set({ [SELECTION_COUNTS_KEY]: prune(counts) });
  }
}

export function reorderBySelection<T extends Suggestion>(
  query: string,
  suggestions: T[],
  counts: SelectionCounts
): T[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return suggestions;
  }

  return suggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      boost: counts[selectionKey(trimmed, suggestion.url)] ?? 0
    }))
    .sort((left, right) => right.boost - left.boost || left.index - right.index)
    .map(({ suggestion }) => suggestion);
}

function prune(counts: SelectionCounts): SelectionCounts {
  const entries = Object.entries(counts);
  if (entries.length <= MAX_ENTRIES) {
    return counts;
  }

  return Object.fromEntries(entries.sort(([, a], [, b]) => b - a).slice(0, MAX_ENTRIES));
}

function isCounts(value: unknown): value is SelectionCounts {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStorage(): StorageArea | undefined {
  if (typeof chrome === 'undefined') {
    return undefined;
  }

  return chrome.storage?.local;
}
