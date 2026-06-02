import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SearchRequest, SearchResponse, Suggestion } from '../shared/messages';
import { createGoogleSearchSuggestion, rankSuggestions } from '../shared/suggestion';
import { SearchBar } from './SearchBar';
import { SuggestionList } from './SuggestionList';

type Mode = 'google' | 'history' | 'window';

export type AppProps = {
  onClose: () => void;
  sendMessage?: (message: SearchRequest) => Promise<SearchResponse>;
};

export function App({ onClose, sendMessage = sendChromeMessage }: AppProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('google');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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
      setSuggestions(staticSuggestion ? [staticSuggestion] : []);
      setError(null);

      if (trimmed) {
        const timer = window.setTimeout(() => {
          void sendMessage({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: trimmed }).then((response) => {
            if (cancelled) {
              return;
            }

            if (response.type === 'GOOGLE_SUGGESTIONS') {
              setSuggestions(dedupeSuggestions(staticSuggestion ? [staticSuggestion, ...response.results] : response.results));
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
  }, [mode, query, sendMessage]);

  const activeSuggestion = suggestions[selectedIndex];
  const modeLabel = mode === 'window' ? 'Window' : mode === 'history' ? 'History' : 'Google';
  const emptyLabel = useMemo(() => {
    if (mode === 'window') {
      return 'No tabs found in this window';
    }

    if (mode === 'history') {
      return query.trim() ? 'No history found' : 'Start typing to search history';
    }

    return query.trim() ? 'No Google search available' : 'Start typing to search Google';
  }, [mode, query]);

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
            url: suggestion?.url ?? createGoogleSearchSuggestion(fallback).url
          });

    if (response.type === 'ERROR') {
      setError(response.message);
      return;
    }

    onClose();
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
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      setMode('window');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => wrapIndex(current + 1, suggestions.length));
      return;
    }

    if (event.key === 'ArrowUp') {
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
