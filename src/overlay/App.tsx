import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SearchRequest, SearchResponse, Suggestion } from '../shared/messages';
import {
  findSearchEngineShortcut,
  SEARCH_ENGINES,
  type SearchEngine
} from '../shared/search-engines';
import {
  createGoogleSearchSuggestion,
  createGoToSuggestion,
  createSearchEngineSuggestion,
  rankSuggestions,
  shouldCreateGoToSuggestion
} from '../shared/suggestion';
import { loadSearchEngines } from '../shared/search-engine-storage';
import {
  DEFAULT_OPEN_TARGET,
  getDefaultOpenTarget,
  type DefaultOpenTarget
} from '../shared/settings-storage';
import { queryChromePages } from '../shared/chrome-pages';
import { detectSiteSearch, type SiteSearchProvider } from '../shared/site-search';
import {
  loadSelectionCounts,
  recordSelection,
  reorderBySelection,
  type SelectionCounts
} from '../shared/selection-store';
import { SearchBar } from './SearchBar';
import { SuggestionList } from './SuggestionList';
import { getImmediateSearchEngineModeColor } from './mode-color';

export type Mode = 'google' | 'history' | 'window' | 'engine' | 'site';

const GOOGLE_MODE_HISTORY_LIMIT = 5;
const SITE_SEARCH_DEBOUNCE_MS = 200;

export type AppProps = {
  onClose: () => void;
  onModeChange?: (mode: Mode) => void;
  returnToGoogleSignal?: number;
  sendMessage?: (message: SearchRequest) => Promise<SearchResponse>;
  loadEngines?: () => Promise<SearchEngine[]>;
  loadDefaultOpenTarget?: () => Promise<DefaultOpenTarget>;
  loadCounts?: () => Promise<SelectionCounts>;
  detectSite?: () => SiteSearchProvider | null;
};

export function App({
  onClose,
  onModeChange,
  returnToGoogleSignal = 0,
  sendMessage = sendChromeMessage,
  loadEngines = loadSearchEngines,
  loadDefaultOpenTarget = getDefaultOpenTarget,
  loadCounts = loadSelectionCounts,
  detectSite = detectSiteSearch
}: AppProps) {
  const [query, setQuery] = useState('');
  // 当前站点有可用的站内搜索（DocSearch / GitHub）就默认走它，Esc 退回 Google。
  const [siteSearch] = useState<SiteSearchProvider | null>(detectSite);
  const [mode, setMode] = useState<Mode>(() => (siteSearch ? 'site' : 'google'));
  const [engines, setEngines] = useState<SearchEngine[]>(SEARCH_ENGINES);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedByUser, setSelectedByUser] = useState(false);
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEngine, setActiveEngine] = useState<SearchEngine | null>(null);
  const [defaultOpenTarget, setDefaultOpenTarget] = useState<DefaultOpenTarget>(DEFAULT_OPEN_TARGET);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionCounts = useRef<SelectionCounts>({});
  const replaceSuggestions = (nextSuggestions: Suggestion[]) => {
    setSelectedIndex(0);
    setSelectedByUser(false);
    setSuggestions(reorderBySelection(query, nextSuggestions, selectionCounts.current));
  };
  const returnToGoogle = useCallback(() => {
    setMode('google');
    setActiveEngine(null);
  }, []);
  const requestFavicon = useCallback(
    async (pageUrl: string) => {
      const response = await sendMessage({ type: 'QUERY_FAVICON', pageUrl });
      return response.type === 'FAVICON' ? response.dataUrl : undefined;
    },
    [sendMessage]
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => siteSearch?.close?.(), [siteSearch]);

  useEffect(() => {
    let cancelled = false;

    void loadEngines().then((nextEngines) => {
      if (!cancelled) {
        setEngines(nextEngines);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadEngines]);

  useEffect(() => {
    let cancelled = false;

    void loadDefaultOpenTarget().then((nextOpenTarget) => {
      if (!cancelled) {
        setDefaultOpenTarget(nextOpenTarget);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadDefaultOpenTarget]);

  useEffect(() => {
    void loadCounts().then((counts) => {
      selectionCounts.current = counts;
    });
  }, [loadCounts]);

  useEffect(() => {
    focusInput(inputRef.current);
    const frame = requestAnimationFrame(() => focusInput(inputRef.current));
    const timer = window.setTimeout(() => focusInput(inputRef.current), 0);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    setSelectedByUser(false);
  }, [mode]);

  useEffect(() => {
    if (returnToGoogleSignal > 0) {
      returnToGoogle();
    }
  }, [returnToGoogle, returnToGoogleSignal]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    const trimmed = query.trim();
    let cancelled = false;
    // 默认不转；走异步的分支在同一轮 effect 里再改成 true（两次 setState 会合并，不会闪）。
    setLoading(false);

    if (mode === 'window') {
      setLoading(true);
      const timer = window.setTimeout(() => {
        void sendMessage({ type: 'QUERY_TABS', query: trimmed }).then((response) => {
          if (cancelled) {
            return;
          }

          setLoading(false);
          if (response.type === 'TABS') {
            replaceSuggestions(response.results);
            setError(null);
          } else if (response.type === 'ERROR') {
            setError(response.message);
          }
        });
      }, 20);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    if (mode === 'google') {
      const staticSuggestion = trimmed
        ? shouldCreateGoToSuggestion(trimmed)
          ? createGoToSuggestion(trimmed)
          : createGoogleSearchSuggestion(trimmed)
        : null;
      const chromeSuggestions = trimmed ? queryChromePages(trimmed) : [];
      const baseSuggestions = staticSuggestion ? [staticSuggestion, ...chromeSuggestions] : chromeSuggestions;
      replaceSuggestions(baseSuggestions);
      setError(null);

      if (trimmed) {
        setLoading(true);
        const timer = window.setTimeout(() => {
          void Promise.all([
            sendMessage({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: trimmed }),
            sendMessage({ type: 'QUERY_HISTORY', query: trimmed })
          ]).then(([googleResponse, historyResponse]) => {
            if (cancelled) {
              return;
            }

            setLoading(false);
            const googleSuggestions =
              googleResponse.type === 'GOOGLE_SUGGESTIONS' ? googleResponse.results : [];
            const historySuggestions =
              historyResponse.type === 'HISTORY'
                ? rankSuggestions(trimmed, historyResponse.results).slice(0, GOOGLE_MODE_HISTORY_LIMIT)
                : [];

            if (googleResponse.type === 'GOOGLE_SUGGESTIONS' || historyResponse.type === 'HISTORY') {
              replaceSuggestions(mergeGoogleModeSuggestions(baseSuggestions, googleSuggestions, historySuggestions));
              setError(null);
            } else if (googleResponse.type === 'ERROR') {
              setError(googleResponse.message);
            } else if (historyResponse.type === 'ERROR') {
              setError(historyResponse.message);
            }
          });
        }, 80);

        return () => {
          cancelled = true;
          window.clearTimeout(timer);
        };
      }

      return () => {
        cancelled = true;
      };
    }

    if (mode === 'site' && siteSearch) {
      if (!trimmed) {
        replaceSuggestions([]);
        return () => {
          cancelled = true;
        };
      }

      setLoading(true);
      const timer = window.setTimeout(() => {
        void siteSearch.query(trimmed).then((results) => {
          if (cancelled) {
            return;
          }

          setLoading(false);
          replaceSuggestions(results);
          setError(null);
        });
      }, SITE_SEARCH_DEBOUNCE_MS);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    if (mode === 'engine' && activeEngine) {
      replaceSuggestions(trimmed ? [createSearchEngineSuggestion(activeEngine, trimmed)] : []);
      setError(null);

      return () => {
        cancelled = true;
      };
    }

    if (mode === 'history' && !trimmed) {
      replaceSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      void sendMessage({ type: 'QUERY_HISTORY', query: trimmed }).then((response) => {
        if (cancelled) {
          return;
        }

        setLoading(false);
        if (response.type === 'HISTORY') {
          replaceSuggestions(rankSuggestions(trimmed, response.results));
          setError(null);
        } else if (response.type === 'ERROR') {
          setError(response.message);
        }
      });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeEngine, mode, query, sendMessage, siteSearch]);

  const activeSuggestion = suggestions[selectedIndex];
  const shortcutEngine = mode === 'google' ? findSearchEngineShortcut(query, engines) : undefined;
  const inputHint = shortcutEngine ? `Tab 搜索 ${shortcutEngine.name}` : undefined;
  const modeLabel =
    mode === 'window'
      ? 'Window'
      : mode === 'history'
        ? 'History'
        : mode === 'site' && siteSearch
          ? siteSearch.label
          : mode === 'engine' && activeEngine
            ? activeEngine.name
            : 'Google';
  const emptyLabel = useMemo(() => {
    if (mode === 'window') {
      return 'No tabs found in this window';
    }

    if (mode === 'history') {
      return query.trim() ? 'No history found' : 'Start typing to search history';
    }

    if (mode === 'site' && siteSearch) {
      return query.trim()
        ? `No ${siteSearch.label} results`
        : `Start typing to search ${siteSearch.label}`;
    }

    if (mode === 'engine' && activeEngine) {
      return query.trim() ? `No ${activeEngine.name} search available` : `Start typing to search ${activeEngine.name}`;
    }

    return query.trim() ? 'No Google search available' : 'Start typing to search Google';
  }, [activeEngine, mode, query, siteSearch]);
  const searchBarModeColor =
    mode === 'site' && siteSearch
      ? siteSearch.color
      : mode === 'engine' && activeEngine
        ? getImmediateSearchEngineModeColor(activeEngine)
        : undefined;

  const commit = async (suggestion: Suggestion | null = activeSuggestion, invertOpenTarget = false) => {
    const fallback = query.trim();
    const openInNewTab = invertOpenTarget ? defaultOpenTarget === 'currentTab' : defaultOpenTarget === 'newTab';

    if (!suggestion && !fallback) {
      return;
    }

    const response =
      suggestion?.type === 'tab'
        ? await sendMessage({ type: 'OPEN_TAB', tabId: suggestion.tabId })
        : await sendMessage({
            type: 'NAVIGATE',
            url:
              suggestion?.url ??
              (mode === 'engine' && activeEngine
                ? createSearchEngineSuggestion(activeEngine, fallback).url
                : createGoogleSearchSuggestion(fallback).url),
            ...(openInNewTab ? { newTab: true } : {})
          });

    if (response.type === 'ERROR') {
      setError(response.message);
      return;
    }

    if (suggestion) {
      void recordSelection(query, suggestion.url, selectionCounts.current);
    }

    onClose();
  };

  const activateEngine = (engine: SearchEngine) => {
    setMode('engine');
    setActiveEngine(engine);
    setQuery('');
    replaceSuggestions([]);
  };

  const handleInput = (nextQuery: string) => {
    if (nextQuery !== query) {
      setSelectedIndex(0);
      setSelectedByUser(false);
    }
    setQuery(nextQuery);
  };

  const selectSuggestion = (index: number, event: PointerEvent) => {
    const position = { x: event.clientX, y: event.clientY };

    if (
      lastPointerPosition.current &&
      lastPointerPosition.current.x === position.x &&
      lastPointerPosition.current.y === position.y
    ) {
      return;
    }

    lastPointerPosition.current = position;
    setSelectedByUser(true);
    setSelectedIndex(index);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposingKey(event)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (mode === 'history' || mode === 'window' || mode === 'site') {
        returnToGoogle();
        return;
      }

      onClose();
      return;
    }

    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      setMode('history');
      setActiveEngine(null);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const engine = findSearchEngineShortcut(query, engines);
      if (engine) {
        activateEngine(engine);
        return;
      }

      setMode('window');
      setActiveEngine(null);
      return;
    }

    if (isMoveDownKey(event)) {
      event.preventDefault();
      setSelectedByUser(true);
      setSelectedIndex((current) => wrapIndex(current + 1, suggestions.length));
      return;
    }

    if (isMoveUpKey(event)) {
      event.preventDefault();
      setSelectedByUser(true);
      setSelectedIndex((current) => wrapIndex(current - 1, suggestions.length));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      // 提交当前高亮项（index 0 通常是「搜索当前输入」的静态建议，
      // 被 reorderBySelection 提升到顶部的历史项也应直接跳转）。
      void commit(activeSuggestion, event.ctrlKey);
    }
  };

  return (
    <div className="searchbar-backdrop" onClick={onClose}>
      <section
        className="searchbar-panel"
        data-visible={visible}
        data-loading={loading}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <SearchBar
          query={query}
          modeLabel={modeLabel}
          modeColor={searchBarModeColor}
          hint={inputHint}
          inputRef={inputRef}
          onInput={handleInput}
          onKeyDown={onKeyDown}
        />
        {error ? <div className="searchbar-error">{error}</div> : null}
        <SuggestionList
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          emptyLabel={emptyLabel}
          requestFavicon={requestFavicon}
          onSelect={selectSuggestion}
          onCommit={(suggestion) => void commit(suggestion)}
        />
      </section>
    </div>
  );
}

function isMoveDownKey(event: KeyboardEvent): boolean {
  return event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'j');
}

function isMoveUpKey(event: KeyboardEvent): boolean {
  return event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'k');
}

function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === 'Process' || event.keyCode === 229;
}

function focusInput(input: HTMLInputElement | null): void {
  input?.focus({ preventScroll: true });
  input?.select();
}

function wrapIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }

  return (index + length) % length;
}

async function sendChromeMessage(message: SearchRequest): Promise<SearchResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { type: 'ERROR', message: 'Chrome runtime is unavailable' };
  }

  return chrome.runtime.sendMessage(message);
}

function dedupeSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const key = suggestion.url.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeGoogleModeSuggestions(
  baseSuggestions: Suggestion[],
  googleSuggestions: Suggestion[],
  historySuggestions: Suggestion[]
): Suggestion[] {
  return dedupeSuggestions([...baseSuggestions, ...historySuggestions, ...googleSuggestions]).slice(0, 10);
}
