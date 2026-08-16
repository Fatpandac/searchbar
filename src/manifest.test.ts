import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('manifest content script timing', () => {
  it('loads the content script at document_start so it can register before Vim-style extensions', () => {
    expect(manifest.content_scripts?.[0]?.run_at).toBe('document_start');
  });

  it('declares an options page for quicksearch settings', () => {
    expect(manifest.options_page).toBe('src/options/index.html');
  });

  it('overrides the new tab page so the search bar is available after Cmd+T', () => {
    expect(manifest.chrome_url_overrides?.newtab).toBe('src/newtab/index.html');
  });
});
