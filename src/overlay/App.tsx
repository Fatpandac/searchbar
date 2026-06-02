import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import { getImmediateSearchEngineModeColor, resolveSearchEngineModeColor } from './mode-color';

type Mode = 'google' | 'history' | 'window' | 'engine';

export type AppProps = {
  onClose: () => void;
  sendMessage?: (message: SearchRequest) => Promise<SearchResponse>;
  loadEngines?: () => Promise<SearchEngine[]>;
  resolveModeColor?: (engine: SearchEngine | null) => Promise<string | undefined>;
};

export function App({
  onClose,
  sendMessage = sendChromeMessage,
  loadEngines = loadSearchEngines,
  resolveModeColor = resolveSearchEngineModeColor
}: AppProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('google');
  const [engines, setEngines] = useState<SearchEngine[]>(SEARCH_ENGINES);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEngine, setActiveEngine] = useState<SearchEngine | null>(null);
  const [modeColor, setModeColor] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

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
    let cancelled = false;

    if (mode !== 'engine' || !activeEngine) {
      setModeColor(undefined);
      return () => {
        cancelled = true;
      };
    }

    void resolveModeColor(activeEngine).then((color) => {
      if (!cancelled) {
        setModeColor(color);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeEngine, mode, resolveModeColor]);

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
            setSuggestions(response.results);
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
      setSuggestions(baseSuggestions);
      setError(null);

      if (trimmed) {
        const timer = window.setTimeout(() => {
          void sendMessage({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: trimmed }).then((response) => {
            if (cancelled) {
              return;
            }

            if (response.type === 'GOOGLE_SUGGESTIONS') {
              setSuggestions(
                response.results.length > 0
                  ? dedupeSuggestions(response.results)
                  : baseSuggestions
              );
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
      }

      return () => {
        cancelled = true;
      };
    }

    if (mode === 'engine' && activeEngine) {
      setSuggestions(trimmed ? [createSearchEngineSuggestion(activeEngine, trimmed)] : []);
      setError(null);

      return () => {
        cancelled = true;
      };
    }

    if (mode === 'history' && !trimmed) {
      setSuggestions([]);
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
          setSuggestions(rankSuggestions(trimmed, response.results));
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
    mode === 'engine' && activeEngine ? modeColor ?? getImmediateSearchEngineModeColor(activeEngine) : undefined;

  const commit = async (suggestion = activeSuggestion) => {
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
                : createGoogleSearchSuggestion(fallback).url)
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
    setSuggestions([]);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
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
      void commit();
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
          onInput={setQuery}
          onKeyDown={onKeyDown}
        />
        {error ? <div className="searchbar-error">{error}</div> : null}
        <SuggestionList
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          emptyLabel={emptyLabel}
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
