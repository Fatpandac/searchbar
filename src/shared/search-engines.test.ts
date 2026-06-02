import { describe, expect, it } from 'vitest';
import {
  createSearchEngineUrl,
  findSearchEngineShortcut,
  mergeSearchEngines
} from './search-engines';

describe('search engines', () => {
  it('finds engines by keyword and alias', () => {
    expect(findSearchEngineShortcut('gh')?.name).toBe('GitHub');
    expect(findSearchEngineShortcut('github')?.name).toBe('GitHub');
    expect(findSearchEngineShortcut('yt')?.name).toBe('YouTube');
    expect(findSearchEngineShortcut('spotify')?.name).toBe('Spotify');
    expect(findSearchEngineShortcut('unknown')).toBeUndefined();
  });

  it('creates encoded search urls', () => {
    const github = findSearchEngineShortcut('gh');
    const youtube = findSearchEngineShortcut('yt');
    const spotify = findSearchEngineShortcut('sp');

    expect(github && createSearchEngineUrl(github, 'react hooks')).toBe(
      'https://github.com/search?q=react+hooks'
    );
    expect(youtube && createSearchEngineUrl(youtube, 'lo fi')).toBe(
      'https://www.youtube.com/results?search_query=lo+fi'
    );
    expect(spotify && createSearchEngineUrl(spotify, 'daft punk')).toBe(
      'https://open.spotify.com/search/daft+punk'
    );
  });

  it('lets custom engines override built-in keywords', () => {
    const engines = mergeSearchEngines([
      {
        id: 'custom-gh',
        name: 'My Git',
        keyword: 'gh',
        searchUrl: 'https://git.example.com/search?q={query}'
      }
    ]);

    expect(findSearchEngineShortcut('gh', engines)?.name).toBe('My Git');
    expect(findSearchEngineShortcut('yt', engines)?.name).toBe('YouTube');
  });
});
