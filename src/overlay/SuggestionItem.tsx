import { useEffect, useRef } from 'preact/hooks';
import type { Suggestion } from '../shared/messages';

type SuggestionItemProps = {
  suggestion: Suggestion;
  selected: boolean;
  onPointerEnter: () => void;
  onClick: () => void;
};

export function SuggestionItem({ suggestion, selected, onPointerEnter, onClick }: SuggestionItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) {
      itemRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selected]);

  return (
    <li
      ref={itemRef}
      className="searchbar-item"
      data-selected={selected}
      role="option"
      aria-selected={selected}
      onPointerEnter={onPointerEnter}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="searchbar-favicon" aria-hidden="true">
        {faviconFor(suggestion)}
      </span>
      <span className="searchbar-copy">
        <span className="searchbar-title">{suggestion.title}</span>
        <span className="searchbar-url">{descriptionFor(suggestion)}</span>
      </span>
      <span className="searchbar-type">{typeLabel(suggestion)}</span>
    </li>
  );
}

function descriptionFor(suggestion: Suggestion): string {
  if (suggestion.type === 'search') {
    return suggestion.description || suggestion.url;
  }

  return suggestion.url;
}

function typeLabel(suggestion: Suggestion): string {
  if (suggestion.type === 'go') {
    return 'Go';
  }

  if (suggestion.type === 'chrome') {
    return 'chrome://';
  }

  if (suggestion.type === 'tab') {
    return 'Tab';
  }

  if (suggestion.type === 'search') {
    return suggestion.provider || 'Google';
  }

  return 'History';
}

function faviconFor(suggestion: Suggestion) {
  if (suggestion.type === 'chrome') {
    return 'C';
  }

  if (suggestion.type === 'go') {
    return '>';
  }

  if (suggestion.type === 'search') {
    return 'G';
  }

  return (
    <img
      alt=""
      src={`chrome://favicon2/?size=32&pageUrl=${encodeURIComponent(suggestion.url)}`}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}
