import { useEffect, useRef, useState } from 'preact/hooks';
import type { Suggestion } from '../shared/messages';

type SuggestionItemProps = {
  suggestion: Suggestion;
  selected: boolean;
  requestFavicon: (pageUrl: string) => Promise<string | undefined>;
  onPointerEnter: () => void;
  onClick: () => void;
};

export function SuggestionItem({
  suggestion,
  selected,
  requestFavicon,
  onPointerEnter,
  onClick
}: SuggestionItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);
  const [faviconSrc, setFaviconSrc] = useState(() => faviconUrlFor(suggestion));
  const [faviconVisible, setFaviconVisible] = useState(true);

  useEffect(() => {
    if (selected) {
      itemRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    const fallbackUrl = faviconUrlFor(suggestion);
    setFaviconVisible(true);
    setFaviconSrc(fallbackUrl);

    if (!shouldRequestWebsiteFavicon(suggestion)) {
      return () => {
        cancelled = true;
      };
    }

    void requestFavicon(suggestion.url).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        setFaviconVisible(true);
        setFaviconSrc(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [requestFavicon, suggestion]);

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
        {faviconFor(suggestion, faviconSrc, faviconVisible, () => setFaviconVisible(false))}
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

function faviconFor(
  suggestion: Suggestion,
  faviconSrc: string,
  faviconVisible: boolean,
  onFaviconError: () => void
) {
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
      src={faviconSrc}
      style={{ display: faviconVisible ? undefined : 'none' }}
      onError={onFaviconError}
    />
  );
}

function shouldRequestWebsiteFavicon(suggestion: Suggestion): boolean {
  return suggestion.type === 'history' || suggestion.type === 'tab';
}

function faviconUrlFor(suggestion: Suggestion): string {
  return `chrome://favicon2/?size=32&pageUrl=${encodeURIComponent(suggestion.url)}`;
}
