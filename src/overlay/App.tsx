import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SearchRequest, SearchResponse, Suggestion } from '../shared/messages';
import {
  findSearchEngineShortcut,
  SEARCH_ENGINES,
  type SearchEngine
} from '../shared/search-engines';
import {
  createGoogleSearchSuggestion,
  createSearchEngineSuggestion,
  rankSuggestions
} from '../shared/suggestion';
import { loadSearchEngines } from '../shared/search-engine-storage';
import { SearchBar } from './SearchBar';
import { SuggestionList } from './SuggestionList';
import { getImmediateSearchEngineModeColor } from './mode-color';

export type Mode = 'google' | 'history' | 'window' | 'engine';

const GOOGLE_MODE_HISTORY_LIMIT = 5;

export type AppProps = {
  onClose: () => void;
  onModeChange?: (mode: Mode) => void;
  returnToGoogleSignal?: number;
  sendMessage?: (message: SearchRequest) => Promise<SearchResponse>;
  loadEngines?: () => Promise<SearchEngine[]>;
};

export function App({
  onClose,
  onModeChange,
  returnToGoogleSignal = 0,
  sendMessage = sendChromeMessage,
  loadEngines = loadSearchEngines
}: AppProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('google');
  const [engines, setEngines] = useState<SearchEngine[]>(SEARCH_ENGINES);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEngine, setActiveEngine] = useState<SearchEngine | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceSuggestions = (nextSuggestions: Suggestion[]) => {
    setSelectedIndex(0);
    setSuggestions(nextSuggestions);
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
  }, [mode, query]);

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

    if (mode === 'window') {
      const timer = window.setTimeout(() => {
        void sendMessage({ type: 'QUERY_TABS', query: trimmed }).then((response) => {
          if (cancelled) {
            return;
          }

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
      const staticSuggestion = trimmed ? createGoogleSearchSuggestion(trimmed) : null;
      const baseSuggestions = staticSuggestion ? [staticSuggestion] : [];
      replaceSuggestions(baseSuggestions);
      setError(null);

      if (trimmed) {
        const timer = window.setTimeout(() => {
          void Promise.all([
            sendMessage({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: trimmed }),
            sendMessage({ type: 'QUERY_HISTORY', query: trimmed })
          ]).then(([googleResponse, historyResponse]) => {
            if (cancelled) {
              return;
            }

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

    const timer = window.setTimeout(() => {
      void sendMessage({ type: 'QUERY_HISTORY', query: trimmed }).then((response) => {
        if (cancelled) {
          return;
        }

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
  }, [activeEngine, mode, query, sendMessage]);

  const activeSuggestion = suggestions[selectedIndex];
  const shortcutEngine = mode === 'google' ? findSearchEngineShortcut(query, engines) : undefined;
  const inputHint = shortcutEngine ? `Tab 搜索 ${shortcutEngine.name}` : undefined;
  const modeLabel =
    mode === 'window'
      ? 'Window'
      : mode === 'history'
        ? 'History'
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

    if (mode === 'engine' && activeEngine) {
      return query.trim() ? `No ${activeEngine.name} search available` : `Start typing to search ${activeEngine.name}`;
    }

    return query.trim() ? 'No Google search available' : 'Start typing to search Google';
  }, [activeEngine, mode, query]);
  const searchBarModeColor =
    mode === 'engine' && activeEngine ? getImmediateSearchEngineModeColor(activeEngine) : undefined;

  const commit = async (suggestion = activeSuggestion, newTab = false) => {
    const fallback = query.trim();

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
            ...(newTab ? { newTab: true } : {})
          });

    if (response.type === 'ERROR') {
      setError(response.message);
      return;
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
    }
    setQuery(nextQuery);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposingKey(event)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (mode === 'history' || mode === 'window') {
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
      setSelectedIndex((current) => wrapIndex(current + 1, suggestions.length));
      return;
    }

    if (isMoveUpKey(event)) {
      event.preventDefault();
      setSelectedIndex((current) => wrapIndex(current - 1, suggestions.length));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void commit(activeSuggestion, event.shiftKey);
    }
  };

  return (
    <div className="searchbar-backdrop" onClick={onClose}>
      <section
        className="searchbar-panel"
        data-visible={visible}
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
          onSelect={setSelectedIndex}
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
  const primarySuggestions = googleSuggestions.length > 0 ? googleSuggestions : baseSuggestions;

  return dedupeSuggestions([...historySuggestions, ...primarySuggestions]).slice(0, 10);
}
