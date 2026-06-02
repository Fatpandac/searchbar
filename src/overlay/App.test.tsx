import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
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
