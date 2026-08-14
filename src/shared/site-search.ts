import type { SearchResult } from './messages';
import { closeDocSearch, hasDocSearch, queryDocSearch } from './docsearch';
import { hasGitHubSearch, queryGitHub } from './github';

export type SiteSearchProvider = {
  id: string;
  label: string;
  color: string;
  match: () => boolean;
  query: (query: string) => Promise<SearchResult[]>;
  close?: () => void;
};

/** 顺序即优先级：先命中的先用。 */
export const SITE_SEARCH_PROVIDERS: SiteSearchProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
    color: '#24292f',
    match: () => hasGitHubSearch(),
    query: (query) => queryGitHub(query)
  },
  {
    id: 'docsearch',
    label: 'Docs',
    color: '#5468ff',
    match: () => hasDocSearch(),
    query: (query) => queryDocSearch(query),
    close: () => closeDocSearch()
  }
];

export function detectSiteSearch(): SiteSearchProvider | null {
  return SITE_SEARCH_PROVIDERS.find((provider) => provider.match()) ?? null;
}
