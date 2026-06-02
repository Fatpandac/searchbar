export type SearchEngine = {
  id: string;
  name: string;
  keyword: string;
  aliases?: string[];
  searchUrl: string;
};

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'github',
    name: 'GitHub',
    keyword: 'gh',
    aliases: ['github'],
    searchUrl: 'https://github.com/search?q={query}'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    keyword: 'yt',
    aliases: ['youtube'],
    searchUrl: 'https://www.youtube.com/results?search_query={query}'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    keyword: 'sp',
    aliases: ['spotify'],
    searchUrl: 'https://open.spotify.com/search/{query}'
  },
  {
    id: 'npm',
    name: 'npm',
    keyword: 'npm',
    searchUrl: 'https://www.npmjs.com/search?q={query}'
  },
  {
    id: 'mdn',
    name: 'MDN',
    keyword: 'mdn',
    searchUrl: 'https://developer.mozilla.org/search?q={query}'
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    keyword: 'so',
    aliases: ['stackoverflow'],
    searchUrl: 'https://stackoverflow.com/search?q={query}'
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keyword: 'wiki',
    aliases: ['w'],
    searchUrl: 'https://en.wikipedia.org/w/index.php?search={query}'
  }
];

export function findSearchEngineShortcut(
  query: string,
  engines: SearchEngine[] = SEARCH_ENGINES
): SearchEngine | undefined {
  const shortcut = query.trim().toLowerCase();

  if (!shortcut) {
    return undefined;
  }

  return engines.find((engine) => {
    return engine.keyword === shortcut || engine.aliases?.includes(shortcut);
  });
}

export function findSearchEngineById(id: string, engines: SearchEngine[] = SEARCH_ENGINES): SearchEngine | undefined {
  return engines.find((engine) => engine.id === id);
}

export function mergeSearchEngines(customEngines: SearchEngine[]): SearchEngine[] {
  const customKeys = new Set(customEngines.flatMap((engine) => engineKeys(engine)));
  const builtIns = SEARCH_ENGINES.filter((engine) => {
    return engineKeys(engine).every((key) => !customKeys.has(key));
  });

  return [...customEngines, ...builtIns];
}

export function createSearchEngineUrl(engine: SearchEngine, query: string): string {
  return engine.searchUrl.replace('{query}', encodeSearchEngineQuery(query));
}

function encodeSearchEngineQuery(query: string): string {
  return encodeURIComponent(query.trim()).replace(/%20/g, '+');
}

function engineKeys(engine: SearchEngine): string[] {
  return [engine.id, engine.keyword, ...(engine.aliases ?? [])].map((key) => key.toLowerCase());
}
