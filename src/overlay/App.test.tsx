import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { SearchRequest, SearchResponse } from '../shared/messages';
import type { DefaultOpenTarget } from '../shared/settings-storage';

function setup(
  responder: (message: SearchRequest) => Promise<SearchResponse> | SearchResponse,
  options: { loadDefaultOpenTarget?: () => Promise<DefaultOpenTarget> } = {}
) {
  const sendMessage = vi.fn((message: SearchRequest) => Promise.resolve(responder(message)));
  const onClose = vi.fn();
  render(<App sendMessage={sendMessage} onClose={onClose} {...options} />);
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

  it('opens URL-like input directly on Enter without selecting a suggestion', async () => {
    const { input, sendMessage, onClose } = setup(() => ({ type: 'NAV_OK' }));

    fireEvent.input(input, { target: { value: 'github.com/foo' } });
    await screen.findByText('Go to github.com/foo');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://github.com/foo'
      });
    });
    expect(onClose).toHaveBeenCalled();
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

  it('uses the configured default Enter open target', async () => {
    const { input, sendMessage } = setup(
      () => ({ type: 'NAV_OK' }),
      { loadDefaultOpenTarget: () => Promise.resolve('newTab') }
    );

    fireEvent.input(input, { target: { value: 'react hooks' } });
    await screen.findByText('react hooks');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.google.com/search?q=react+hooks',
        newTab: true
      });
    });
  });

  it('uses Ctrl+Enter as the opposite of the configured default open target', async () => {
    const currentTab = setup(() => ({ type: 'NAV_OK' }));

    fireEvent.input(currentTab.input, { target: { value: 'react hooks' } });
    await screen.findByText('react hooks');
    fireEvent.keyDown(currentTab.input, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(currentTab.sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.google.com/search?q=react+hooks',
        newTab: true
      });
    });

    cleanup();
    const newTab = setup(
      () => ({ type: 'NAV_OK' }),
      { loadDefaultOpenTarget: () => Promise.resolve('newTab') }
    );

    fireEvent.input(newTab.input, { target: { value: 'react hooks' } });
    await screen.findByText('react hooks');
    fireEvent.keyDown(newTab.input, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(newTab.sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.google.com/search?q=react+hooks'
      });
    });
  });

  it('lets composing Enter confirm IME text instead of committing the selected suggestion', async () => {
    const { input, sendMessage, onClose } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'ni hao',
              url: 'https://www.google.com/search?q=ni+hao'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'ni' } });
    expect(await screen.findByText('ni hao')).toBeTruthy();
    sendMessage.mockClear();

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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

  it('shows chrome:// pages in default search and opens the selected page', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS' || message.type === 'QUERY_HISTORY') {
        return message.type === 'QUERY_GOOGLE_SUGGESTIONS'
          ? { type: 'GOOGLE_SUGGESTIONS', results: [] }
          : { type: 'HISTORY', results: [] };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'settings' } });
    const chromePage = await screen.findByText('Settings');

    fireEvent.pointerMove(chromePage.closest('[role="option"]') as HTMLElement);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'chrome://settings'
      });
    });
  });

  it('includes the Chrome extensions shortcut page in default search', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return { type: 'GOOGLE_SUGGESTIONS', results: [] };
      }

      if (message.type === 'QUERY_HISTORY') {
        return { type: 'HISTORY', results: [] };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'plugin settings' } });

    expect(await screen.findByText('Extensions Shortcuts')).toBeTruthy();
    expect(await screen.findByText('chrome://extensions/shortcuts')).toBeTruthy();
  });

  it('keeps direct Google search as the default Enter action after autosuggestions load', async () => {
    const { input, sendMessage, onClose } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
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
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://www.google.com/search?q=react'
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the current query as the first Google suggestion after autosuggestions load', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
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
    expect(options[0].querySelector('.searchbar-title')?.textContent).toBe('react');
    expect(options[0].querySelector('.searchbar-url')?.textContent).toBe('https://www.google.com/search?q=react');
    expect(options[0].getAttribute('data-selected')).toBe('true');
  });

  it('shows matching history entries together with Google autosuggestions in default search mode', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'react hooks',
              url: 'https://www.google.com/search?q=react+hooks'
            }
          ]
        };
      }

      if (message.type === 'QUERY_HISTORY') {
        return {
          type: 'HISTORY',
          results: [
            {
              type: 'history',
              title: 'React Router Docs',
              url: 'https://reactrouter.com',
              visitCount: 4
            }
          ]
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react' } });

    expect(await screen.findByText('react hooks')).toBeTruthy();
    const historyOption = await screen.findByText('React Router Docs');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_GOOGLE_SUGGESTIONS', query: 'react' });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_HISTORY', query: 'react' });

    const options = screen.getAllByRole('option');
    expect(options[0].querySelector('.searchbar-title')?.textContent).toBe('react');
    expect(options[1].textContent).toContain('React Router Docs');
    expect(options[2].textContent).toContain('react hooks');

    fireEvent.pointerMove(historyOption.closest('[role="option"]') as HTMLElement);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'NAVIGATE',
        url: 'https://reactrouter.com'
      });
    });
  });

  it('shows only the five best matching history entries in default search mode', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return {
          type: 'GOOGLE_SUGGESTIONS',
          results: [
            {
              type: 'search',
              title: 'react hooks',
              url: 'https://www.google.com/search?q=react+hooks'
            }
          ]
        };
      }

      if (message.type === 'QUERY_HISTORY') {
        return {
          type: 'HISTORY',
          results: [
            { type: 'history', title: 'React Alpha', url: 'https://alpha.example.com', visitCount: 1 },
            { type: 'history', title: 'React Beta', url: 'https://beta.example.com', visitCount: 1 },
            { type: 'history', title: 'React Gamma', url: 'https://gamma.example.com', visitCount: 1 },
            { type: 'history', title: 'React Delta', url: 'https://delta.example.com', visitCount: 1 },
            { type: 'history', title: 'React Epsilon', url: 'https://epsilon.example.com', visitCount: 1 },
            { type: 'history', title: 'React Zeta', url: 'https://zeta.example.com', visitCount: 1 }
          ]
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'react' } });

    expect(await screen.findByText('React Epsilon')).toBeTruthy();
    expect(screen.queryByText('React Zeta')).toBeNull();
    expect(await screen.findByText('react hooks')).toBeTruthy();

    const options = screen.getAllByRole('option');
    expect(options.filter((option) => option.textContent?.includes('History'))).toHaveLength(5);
    expect(options[0].querySelector('.searchbar-title')?.textContent).toBe('react');
    expect(options[6].textContent).toContain('react hooks');
  });

  it('selects the current query after autosuggestions load', async () => {
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
    expect(options[0].querySelector('.searchbar-title')?.textContent).toBe('react');
    expect(options[0].getAttribute('data-selected')).toBe('true');
  });

  it('keeps the current query selected in Google mode when refreshed results appear under a stationary pointer', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_GOOGLE_SUGGESTIONS') {
        return { type: 'GOOGLE_SUGGESTIONS', results: [] };
      }

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

    fireEvent.input(input, { target: { value: 'git' } });
    expect(await screen.findByText('GitHub')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('data-selected')).toBe('true');

    fireEvent.input(input, { target: { value: 'github' } });
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options[0].querySelector('.searchbar-title')?.textContent).toBe('github');
      expect(options[1].querySelector('.searchbar-title')?.textContent).toBe('GitHub');
    });

    fireEvent.pointerEnter(screen.getByText('GitHub').closest('[role="option"]') as HTMLElement);

    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('data-selected')).toBe('true');
    expect(options[1].getAttribute('data-selected')).toBe('false');
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

  it('shows the website favicon for history results', async () => {
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

      if (message.type === 'QUERY_FAVICON') {
        return {
          type: 'FAVICON',
          dataUrl: 'data:image/png;base64,AAAA'
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    fireEvent.input(input, { target: { value: 'git' } });
    const option = await screen.findByRole('option');

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_FAVICON', pageUrl: 'https://github.com' });
      expect((option.querySelector('img') as HTMLImageElement).src).toBe('data:image/png;base64,AAAA');
    });
  });

  it('selects the first history item after the history list refreshes', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_HISTORY') {
        return {
          type: 'HISTORY',
          results:
            message.query === 'docs'
              ? [
                  {
                    type: 'history',
                    title: 'Docs One',
                    url: 'https://docs-one.example.com',
                    visitCount: 1
                  },
                  {
                    type: 'history',
                    title: 'Docs Two',
                    url: 'https://docs-two.example.com',
                    visitCount: 1
                  }
                ]
              : [
                  {
                    type: 'history',
                    title: 'Git One',
                    url: 'https://git-one.example.com',
                    visitCount: 1
                  },
                  {
                    type: 'history',
                    title: 'Git Two',
                    url: 'https://git-two.example.com',
                    visitCount: 1
                  }
                ]
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    fireEvent.input(input, { target: { value: 'git' } });
    expect(await screen.findByText('Git Two')).toBeTruthy();

    fireEvent.pointerMove(screen.getByText('Git Two').closest('[role="option"]') as HTMLElement);
    fireEvent.input(input, { target: { value: 'docs' } });
    fireEvent.pointerMove(screen.getByText('Git Two').closest('[role="option"]') as HTMLElement);
    expect(await screen.findByText('Docs Two')).toBeTruthy();

    const options = screen.getAllByRole('option');
    expect(options[0].textContent).toContain('Docs One');
    expect(options[0].getAttribute('data-selected')).toBe('true');
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

  it('uses the search engine mode color without resolving favicon during quicksearch activation', async () => {
    const loadEngines = vi.fn(() =>
      Promise.resolve([
        {
          id: 'custom-docs',
          name: 'Docs',
          keyword: 'docs',
          searchUrl: 'https://docs.example.com/search?q={query}',
          modeColor: '#336699'
        }
      ])
    );

    render(<App sendMessage={vi.fn(() => Promise.resolve({ type: 'NAV_OK' as const }))} onClose={vi.fn()} loadEngines={loadEngines} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;

    await waitFor(() => expect(loadEngines).toHaveBeenCalled());
    fireEvent.input(input, { target: { value: 'docs' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    const mode = await screen.findByText('Docs');
    expect((mode as HTMLElement).style.background).toBe('rgb(51, 102, 153)');
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

  it('shows the website favicon for window tab results', async () => {
    const { input, sendMessage } = setup((message) => {
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

      if (message.type === 'QUERY_FAVICON') {
        return {
          type: 'FAVICON',
          dataUrl: 'data:image/png;base64,BBBB'
        };
      }

      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab' });
    const option = await screen.findByRole('option');

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'QUERY_FAVICON', pageUrl: 'https://docs.example.com' });
      expect((option.querySelector('img') as HTMLImageElement).src).toBe('data:image/png;base64,BBBB');
    });
  });

  it('wraps keyboard selection from the last item back to the first even when the pointer sits on the list', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_TABS') {
        return {
          type: 'TABS',
          results: [
            {
              type: 'tab',
              tabId: 1,
              title: 'First Tab',
              url: 'https://first.example.com'
            },
            {
              type: 'tab',
              tabId: 2,
              title: 'Second Tab',
              url: 'https://second.example.com'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(await screen.findByText('Second Tab')).toBeTruthy();

    const lastOption = screen.getAllByRole('option')[1];
    fireEvent.pointerMove(lastOption, { clientX: 10, clientY: 10 });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.pointerMove(lastOption, { clientX: 10, clientY: 10 });

    expect(screen.getAllByRole('option')[0].getAttribute('data-selected')).toBe('true');
  });

  it('uses Ctrl+J and Ctrl+K to move the selected item', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_TABS') {
        return {
          type: 'TABS',
          results: [
            {
              type: 'tab',
              tabId: 1,
              title: 'First Tab',
              url: 'https://first.example.com'
            },
            {
              type: 'tab',
              tabId: 2,
              title: 'Second Tab',
              url: 'https://second.example.com'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(await screen.findByText('Second Tab')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'j', ctrlKey: true });
    let options = screen.getAllByRole('option');
    expect(options[1].getAttribute('data-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
    options = screen.getAllByRole('option');
    expect(options[0].getAttribute('data-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'j', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_TAB', tabId: 2 });
    });
  });

  it('resets the selected item immediately after the search content changes', async () => {
    const { input, sendMessage } = setup((message) => {
      if (message.type === 'QUERY_TABS') {
        return {
          type: 'TABS',
          results: [
            {
              type: 'tab',
              tabId: 1,
              title: 'First Tab',
              url: 'https://first.example.com'
            },
            {
              type: 'tab',
              tabId: 2,
              title: 'Second Tab',
              url: 'https://second.example.com'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'first' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(await screen.findByText('Second Tab')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('data-selected')).toBe('true');

    fireEvent.input(input, { target: { value: 'first changed' } });

    expect(screen.getAllByRole('option')[0].getAttribute('data-selected')).toBe('true');
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'OPEN_TAB', tabId: 2 });
  });

  it('keeps the selected item when an input event does not change the search content', async () => {
    const { input } = setup((message) => {
      if (message.type === 'QUERY_TABS') {
        return {
          type: 'TABS',
          results: [
            {
              type: 'tab',
              tabId: 1,
              title: 'First Tab',
              url: 'https://first.example.com'
            },
            {
              type: 'tab',
              tabId: 2,
              title: 'Second Tab',
              url: 'https://second.example.com'
            }
          ]
        };
      }
      return { type: 'NAV_OK' };
    });

    fireEvent.input(input, { target: { value: 'first' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(await screen.findByText('Second Tab')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('data-selected')).toBe('true');

    fireEvent.input(input, { target: { value: 'first' } });

    expect(screen.getAllByRole('option')[1].getAttribute('data-selected')).toBe('true');
  });

  it('returns to Google search on Escape from history search', async () => {
    const { input, onClose } = setup((message) => {
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
    expect(await screen.findByText('GitHub')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns to Google search on Escape from window search', async () => {
    const { input, onClose } = setup((message) => {
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
    expect(await screen.findByText('Project Docs')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { input, onClose } = setup(() => ({ type: 'HISTORY', results: [] }));

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
