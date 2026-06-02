export type SearchEngine = {
  id: string;
  name: string;
  keyword: string;
  aliases?: string[];
  searchUrl: string;
  modeColor?: string;
};

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'github',
    name: 'GitHub',
    keyword: 'gh',
    aliases: ['github'],
    searchUrl: 'https://github.com/search?q={query}',
    modeColor: '#24292f'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    keyword: 'yt',
    aliases: ['youtube'],
    searchUrl: 'https://www.youtube.com/results?search_query={query}',
    modeColor: '#ff0033'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    keyword: 'sp',
    aliases: ['spotify'],
    searchUrl: 'https://open.spotify.com/search/{query}',
    modeColor: '#1db954'
  },
  {
    id: 'npm',
    name: 'npm',
    keyword: 'npm',
    searchUrl: 'https://www.npmjs.com/search?q={query}',
    modeColor: '#cb3837'
  },
  {
    id: 'mdn',
    name: 'MDN',
    keyword: 'mdn',
    searchUrl: 'https://developer.mozilla.org/search?q={query}',
    modeColor: '#1b1b1b'
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    keyword: 'so',
    aliases: ['stackoverflow'],
    searchUrl: 'https://stackoverflow.com/search?q={query}',
    modeColor: '#f48024'
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keyword: 'wiki',
    aliases: ['w'],
    searchUrl: 'https://en.wikipedia.org/w/index.php?search={query}',
    modeColor: '#54595d'
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
