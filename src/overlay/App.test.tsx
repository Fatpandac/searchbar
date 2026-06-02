import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { SearchRequest, SearchResponse } from '../shared/messages';

function setup(responder: (message: SearchRequest) => Promise<SearchResponse> | SearchResponse) {
  const sendMessage = vi.fn((message: SearchRequest) => Promise.resolve(responder(message)));
  const onClose = vi.fn();
  render(<App sendMessage={sendMessage} onClose={onClose} />);
  const input = screen.getByRole('combobox') as HTMLInputElement;

  return { input, sendMessage, onClose };
}

function setupWithEngines(responder: (message: SearchRequest) => Promise<SearchResponse> | SearchResponse) {
  const sendMessage = vi.fn((message: SearchRequest) => Promise.resolve(responder(message)));
  const onClose = vi.fn();
  render(
    <App
      sendMessage={sendMessage}
      onClose={onClose}
      loadEngines={() =>
        Promise.resolve([
          {
            id: 'custom-linear',
            name: 'Linear',
            keyword: 'li',
            searchUrl: 'https://linear.app/search?q={query}'
          }
        ])
      }
    />
  );
  const input = screen.getByRole('combobox') as HTMLInputElement;

  return { input, sendMessage, onClose };
}

describe('App', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('focuses the search input after mount', async () => {
    const { input } = setup(() => ({ type: 'HISTORY', results: [] }));

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('defaults to Google search and navigates the query on Enter without querying history', async () => {
    const { input, sendMessage, onClose } = setup((message) => {
      if (message.type === 'QUERY_HISTORY') {
        return { type: 'HISTORY', results: [] };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react hooks' } });
    await screen.findByText('react hooks');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.google.com/search?q=react+hooks'
      });
    });
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'QUERY_HISTORY', query: 'react hooks' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Google autosuggestions in default search mode', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'react hooks',
              description: 'React Hooks',
              url: 'https://www.google.com/search?q=react+hooks'
            },
            {
              type: 'search',
              title: 'react query',
              description: 'React Query',
              url: 'https://www.google.com/search?q=react+query'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react' } });

    expect(await screen.findByText('react')).toBeTruthy();
    expect(await screen.findByText('react hooks')).toBeTruthy();
    expect(await screen.findByText('React Hooks')).toBeTruthy();
    expect(await screen.findByText('react query')).toBeTruthy();
    expect(await screen.findByText('React Query')).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: 'react' });
  });

  it('selects the first returned Google suggestion after autosuggestions load', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'react hooks',
              url: 'https://www.google.com/search?q=react+hooks'
            },
            {
              type: 'search',
              title: 'react query',
              url: 'https://www.google.com/search?q=react+query'
            }
          ]
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react' } });
    expect(await screen.findByText('react query')).toBeTruthy();

    const options = screen.getAllByRole('option');
    expect(options[0].textContent).toContain('react hooks');
    expect(options[0].getAttribute('data-selected')).toBe('true');
  });

  it('keeps focus in the search input when pressing a suggestion', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'react hooks',
              description: 'React Hooks',
              url: 'https://www.google.com/search?q=react+hooks'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react' } });
    const suggestion = await screen.findByRole('option');

    expect(fireEvent.mouseDown(suggestion)).toBe(false);
  });

  it('uses Shift+Tab for history search', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_HISTORY') {
        return {
          type: 'HISTORY',
          results: [
            {
              type: 'history',
              title: 'GitHub',
              url: 'https://github.com',
              visitCount: 3
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    fireEvent.input(input, { target: { value: 'git' } });

    expect(await screen.findByText('History')).toBeTruthy();
    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_HISTORY', query: 'git' });
  });

  it('uses keyword Tab to search GitHub', async () => {
    const { input, sendMessage, onClose } = setup(() => ({ type: 'NAV_OK' }));

    fireEvent.input(input, { target: { value: 'gh' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(input.value).toBe('');
    expect(await screen.findByText('GitHub')).toBeTruthy();

    fireEvent.input(input, { target: { value: 'react hooks' } });
    await screen.findByText('react hooks');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://github.com/search?q=react+hooks'
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a shortcut hint inside the input without adding a list item', async () => {
    const { input } = setup(() => ({ type: 'NAV_OK' }));

    fireEvent.input(input, { target: { value: 'gh' } });

    expect(await screen.findByText('Tab 搜索 GitHub')).toBeTruthy();
    expect(screen.queryByText('Search GitHub')).toBeNull();
    expect(screen.queryByText('Press Tab to quick search')).toBeNull();
  });

  it('supports YouTube and Spotify keyword searches', async () => {
    const youtube = setup(() => ({ type: 'NAV_OK' }));

    fireEvent.input(youtube.input, { target: { value: 'yt' } });
    fireEvent.keyDown(youtube.input, { key: 'Tab' });
    fireEvent.input(youtube.input, { target: { value: 'lo fi' } });
    fireEvent.keyDown(youtube.input, { key: 'Enter' });

    await waitFor(() => {
      expect(youtube.sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.youtube.com/results?search_query=lo+fi'
      });
    });

    cleanup();
    const spotify = setup(() => ({ type: 'NAV_OK' }));
    fireEvent.input(spotify.input, { target: { value: 'sp' } });
    fireEvent.keyDown(spotify.input, { key: 'Tab' });
    fireEvent.input(spotify.input, { target: { value: 'daft punk' } });
    fireEvent.keyDown(spotify.input, { key: 'Enter' });

    await waitFor(() => {
      expect(spotify.sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://open.spotify.com/search/daft+punk'
      });
    });
  });

  it('uses configured custom quicksearch engines', async () => {
    const { input, sendMessage } = setupWithEngines(() => ({ type: 'NAV_OK' }));

    fireEvent.input(input, { target: { value: 'li' } });

    expect(await screen.findByText('Tab 搜索 Linear')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.input(input, { target: { value: 'bug report' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://linear.app/search?q=bug+report'
      });
    });
  });

  it('uses Tab for current window tab search and opens the selected tab on Enter', async () => {
    const { input, sendMessage, onClose } = setup((message) => {
      if (message.type === 'QUERY_TABS') {
        return {
          type: 'TABS',
          results: [
            {
              type: 'tab',
              tabId: 42,
              windowId: 2,
              title: 'Project Docs',
              url: 'https://docs.example.com'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab' });

    expect(await screen.findByText('Window')).toBeTruthy();
    expect(await screen.findByText('Project Docs')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_TAB', tabId: 42 });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { input, onClose } = setup(() => ({ type: 'HISTORY', results: [] }));

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
