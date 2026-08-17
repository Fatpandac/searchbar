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
  DEFAULT_VIM_MODE,
  getDefaultOpenTarget,
  getVimMode,
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
  loadVimMode?: () => Promise<boolean>;
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
  loadVimMode = getVimMode,
  loadCounts = loadSelectionCounts,
  detectSite = detectSiteSearch
}: AppProps) {
  const [query, setQuery] = useState('');
  // 站内搜索（DocSearch / GitHub）不抢默认，统一从 Google 开场，靠 Tab 切进去。
  const [siteSearch] = useState<SiteSearchProvider | null>(detectSite);
  const [mode, setMode] = useState<Mode>('google');
  const [engines, setEngines] = useState<SearchEngine[]>(SEARCH_ENGINES);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedByUser, setSelectedByUser] = useState(false);
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  // 跳转期间浏览器还停在旧页面，保持指示条转着，避免看起来「没反应」。
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEngine, setActiveEngine] = useState<SearchEngine | null>(null);
  const [defaultOpenTarget, setDefaultOpenTarget] = useState<DefaultOpenTarget>(DEFAULT_OPEN_TARGET);
  const [vimMode, setVimMode] = useState(DEFAULT_VIM_MODE);
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
    let cancelled = false;

    void loadVimMode().then((nextVimMode) => {
      if (!cancelled) {
        setVimMode(nextVimMode);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadVimMode]);

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
  // Tab 往前、Shift+Tab 往后；没站内搜索时退化成原来的 google/window/history 三档。
  const modeCycle = useMemo<Mode[]>(
    () => (siteSearch ? ['google', 'site', 'window', 'history'] : ['google', 'window', 'history']),
    [siteSearch]
  );
  const labelForMode = useCallback(
    (target: Mode) =>
      target === 'window'
        ? 'Window'
        : target === 'history'
          ? 'History'
          : target === 'site' && siteSearch
            ? siteSearch.label
            : target === 'engine' && activeEngine
              ? activeEngine.name
              : // 默认模式聚合 Google、历史、chrome:// 页和 URL 直达，叫 Search 才不擒。
                'Search',
    [activeEngine, siteSearch]
  );
  // engine 模式不在循环里，indexOf 得 -1，Tab 回到 google。
  const stepMode = useCallback(
    (step: number): Mode =>
      modeCycle[(modeCycle.indexOf(mode) + step + modeCycle.length) % modeCycle.length],
    [mode, modeCycle]
  );
  const shortcutEngine = mode === 'google' ? findSearchEngineShortcut(query, engines) : undefined;
  // 快捷词提示优先；模式循环提示只在空输入时出现，不挡着正在敲的字。
  const inputHint = shortcutEngine
    ? `Tab 搜索 ${shortcutEngine.name}`
    : query.trim()
      ? undefined
      : `Tab → ${labelForMode(stepMode(1))}`;
  const modeLabel = labelForMode(mode);
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

    return query.trim() ? 'No results' : 'Start typing to search';
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

    setNavigating(true);

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
      setNavigating(false);
      setError(response.message);
      return;
    }

    if (suggestion) {
      void recordSelection(query, suggestion.url, selectionCounts.current);
    }

    // 新标签页里跳转后面板还留着，输入必须清空；覆盖层会整体卸载，清空无副作用。
    setQuery('');
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

    if (event.key === 'Tab') {
      event.preventDefault();
      const engine = event.shiftKey ? undefined : findSearchEngineShortcut(query, engines);
      if (engine) {
        activateEngine(engine);
        return;
      }

      setMode(stepMode(event.shiftKey ? -1 : 1));
      setActiveEngine(null);
      return;
    }

    if (isMoveDownKey(event, vimMode)) {
      event.preventDefault();
      setSelectedByUser(true);
      setSelectedIndex((current) => wrapIndex(current + 1, suggestions.length));
      return;
    }

    if (isMoveUpKey(event, vimMode)) {
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
        data-navigating={navigating}
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

function isMoveDownKey(event: KeyboardEvent, vimMode: boolean): boolean {
  return event.key === 'ArrowDown' || (vimMode && event.ctrlKey && event.key.toLowerCase() === 'j');
}

function isMoveUpKey(event: KeyboardEvent, vimMode: boolean): boolean {
  return event.key === 'ArrowUp' || (vimMode && event.ctrlKey && event.key.toLowerCase() === 'k');
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
