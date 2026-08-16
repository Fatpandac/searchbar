import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionItem } from './SuggestionItem';
import type { Suggestion } from '../shared/messages';

function renderItem(suggestion: Suggestion) {
  const requestFavicon = vi.fn().mockResolvedValue(undefined);
  render(
    <SuggestionItem
      suggestion={suggestion}
      selected={false}
      requestFavicon={requestFavicon}
      onPointerMove={() => {}}
      onClick={() => {}}
    />
  );
  return { requestFavicon };
}

describe('SuggestionItem', () => {
  it('keeps the G icon for plain Google suggestions', () => {
    const { requestFavicon } = renderItem({
      type: 'search',
      title: 'react hooks',
      url: 'https://www.google.com/search?q=react+hooks'
    });

    expect(screen.getByRole('option').textContent).toContain('G');
    expect(requestFavicon).not.toHaveBeenCalled();
  });

  it('uses the site favicon for provider search results instead of the Google icon', () => {
    const { requestFavicon } = renderItem({
      type: 'search',
      title: 'useState',
      url: 'https://react.dev/reference/react/useState',
      provider: 'DocSearch'
    });

    const option = screen.getByRole('option');
    expect(option.querySelector('.searchbar-favicon img')).toBeTruthy();
    expect(requestFavicon).toHaveBeenCalledWith('https://react.dev/reference/react/useState');
  });
});
