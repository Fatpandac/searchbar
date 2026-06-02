import { useEffect, useState } from 'preact/hooks';
import type { SearchEngine } from '../shared/search-engines';
import { getCustomSearchEngines, saveCustomSearchEngines } from '../shared/search-engine-storage';

export type OptionsAppProps = {
  loadCustomEngines?: () => Promise<SearchEngine[]>;
  saveCustomEngines?: (engines: SearchEngine[]) => Promise<void>;
};

type Draft = {
  name: string;
  keyword: string;
  searchUrl: string;
};

const EMPTY_DRAFT: Draft = { name: '', keyword: '', searchUrl: '' };

export function OptionsApp({
  loadCustomEngines = getCustomSearchEngines,
  saveCustomEngines: saveEngines = saveCustomSearchEngines
}: OptionsAppProps) {
  const [engines, setEngines] = useState<SearchEngine[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void loadCustomEngines().then((nextEngines) => {
      if (!cancelled) {
        setEngines(nextEngines);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadCustomEngines]);

  const addEngine = async () => {
    const nextEngine = createEngine(draft);
    if (!nextEngine.searchUrl.includes('{query}')) {
      setError('Search URL must include {query}');
      return;
    }

    const nextEngines = [...engines.filter((engine) => engine.keyword !== nextEngine.keyword), nextEngine];
    setEngines(nextEngines);
    setDraft(EMPTY_DRAFT);
    setError('');
    await saveEngines(nextEngines);
  };

  const removeEngine = async (id: string) => {
    const nextEngines = engines.filter((engine) => engine.id !== id);
    setEngines(nextEngines);
    await saveEngines(nextEngines);
  };

  return (
    <main className="options-shell">
      <section className="options-header">
        <h1>Quicksearch Settings</h1>
        <p>Configure shortcuts like gh, yt, or your own keyword. Search URLs must include {'{query}'}.</p>
      </section>

      <section className="options-form" aria-label="Add quicksearch">
        <label>
          <span>Name</span>
          <input
            id="quicksearch-name"
            name="name"
            autoComplete="off"
            aria-label="Name"
            value={draft.name}
            onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Keyword</span>
          <input
            id="quicksearch-keyword"
            name="keyword"
            autoComplete="off"
            aria-label="Keyword"
            value={draft.keyword}
            onInput={(event) => setDraft({ ...draft, keyword: event.currentTarget.value })}
          />
        </label>
        <label className="options-url-field">
          <span>Search URL</span>
          <input
            id="quicksearch-search-url"
            name="searchUrl"
            autoComplete="off"
            aria-label="Search URL"
            value={draft.searchUrl}
            placeholder="https://example.com/search?q={query}"
            onInput={(event) => setDraft({ ...draft, searchUrl: event.currentTarget.value })}
          />
        </label>
        <button type="button" onClick={() => void addEngine()}>
          Add
        </button>
      </section>

      {error ? <div className="options-error">{error}</div> : null}

      <section className="options-list" aria-label="Custom quicksearch engines">
        {engines.length === 0 ? <p className="options-empty">No custom quicksearch engines configured.</p> : null}
        {engines.map((engine) => (
          <article className="options-engine" key={engine.id}>
            <div>
              <strong>{engine.name}</strong>
              <span>{engine.keyword}</span>
              <code>{engine.searchUrl}</code>
            </div>
            <button type="button" onClick={() => void removeEngine(engine.id)}>
              Remove
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function createEngine(draft: Draft): SearchEngine {
  const keyword = draft.keyword.trim().toLowerCase();

  return {
    id: `custom-${keyword}`,
    name: draft.name.trim(),
    keyword,
    searchUrl: draft.searchUrl.trim()
  };
}
