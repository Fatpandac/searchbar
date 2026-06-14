import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { OptionsApp } from './App';
import type { SearchEngine } from '../shared/search-engines';
import type { DefaultOpenTarget } from '../shared/settings-storage';

describe('OptionsApp', () => {
  it('loads and saves custom quicksearch engines', async () => {
    const loadCustomEngines = vi.fn<() => Promise<SearchEngine[]>>(() =>
      Promise.resolve([
        {
          id: 'custom-linear',
          name: 'Linear',
          keyword: 'li',
          searchUrl: 'https://linear.app/search?q={query}'
        }
      ])
    );
    const saveCustomEngines = vi.fn<(_: SearchEngine[]) => Promise<void>>(() => Promise.resolve());

    const resolveModeColor = vi.fn(() => Promise.resolve('#336699'));

    render(
      <OptionsApp
        loadCustomEngines={loadCustomEngines}
        saveCustomEngines={saveCustomEngines}
        resolveModeColor={resolveModeColor}
      />
    );

    expect(await screen.findByText('Linear')).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Docs' } });
    fireEvent.input(screen.getByLabelText('Keyword'), { target: { value: 'docs' } });
    fireEvent.input(screen.getByLabelText('Search URL'), {
      target: { value: 'https://docs.example.com/search?q={query}' }
    });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(saveCustomEngines).toHaveBeenCalledWith([
        {
          id: 'custom-linear',
          name: 'Linear',
          keyword: 'li',
          searchUrl: 'https://linear.app/search?q={query}'
        },
        {
          id: 'custom-docs',
          name: 'Docs',
          keyword: 'docs',
          searchUrl: 'https://docs.example.com/search?q={query}',
          modeColor: '#336699'
        }
      ]);
    });
    expect(resolveModeColor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-docs',
        searchUrl: 'https://docs.example.com/search?q={query}'
      })
    );
    expect(screen.getByText('Docs')).toBeTruthy();
  });

  it('requires URL templates to include the query token', async () => {
    const saveCustomEngines = vi.fn<(_: SearchEngine[]) => Promise<void>>(() => Promise.resolve());

    render(
      <OptionsApp
        loadCustomEngines={() => Promise.resolve([])}
        saveCustomEngines={saveCustomEngines}
      />
    );

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bad' } });
    fireEvent.input(screen.getByLabelText('Keyword'), { target: { value: 'bad' } });
    fireEvent.input(screen.getByLabelText('Search URL'), {
      target: { value: 'https://example.com/search' }
    });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText('Search URL must include {query}')).toBeTruthy();
    expect(saveCustomEngines).not.toHaveBeenCalled();
  });

  it('loads and saves the default Enter open target', async () => {
    const loadDefaultOpenTarget = vi.fn<() => Promise<DefaultOpenTarget>>(() => Promise.resolve('currentTab'));
    const saveDefaultOpenTarget = vi.fn<(_: DefaultOpenTarget) => Promise<void>>(() => Promise.resolve());

    render(
      <OptionsApp
        loadCustomEngines={() => Promise.resolve([])}
        saveCustomEngines={() => Promise.resolve()}
        loadDefaultOpenTarget={loadDefaultOpenTarget}
        saveDefaultOpenTarget={saveDefaultOpenTarget}
      />
    );

    const currentTab = await screen.findByLabelText('Open in current tab');
    const newTab = screen.getByLabelText('Open in new tab');

    expect((currentTab as HTMLInputElement).checked).toBe(true);

    fireEvent.click(newTab);

    await waitFor(() => {
      expect(saveDefaultOpenTarget).toHaveBeenCalledWith('newTab');
    });
    expect((newTab as HTMLInputElement).checked).toBe(true);
  });
});
