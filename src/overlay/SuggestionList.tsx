import type { Suggestion } from '../shared/messages';
import { SuggestionItem } from './SuggestionItem';

type SuggestionListProps = {
  suggestions: Suggestion[];
  selectedIndex: number;
  emptyLabel: string;
  requestFavicon: (pageUrl: string) => Promise<string | undefined>;
  onSelect: (index: number, event: PointerEvent) => void;
  onCommit: (suggestion: Suggestion) => void;
};

export function SuggestionList({
  suggestions,
  selectedIndex,
  emptyLabel,
  requestFavicon,
  onSelect,
  onCommit
}: SuggestionListProps) {
  if (suggestions.length === 0) {
    return <div className="searchbar-empty">{emptyLabel}</div>;
  }

  return (
    <ul className="searchbar-list" role="listbox">
      {suggestions.map((suggestion, index) => (
        <SuggestionItem
          key={`${suggestion.type}:${suggestion.url}`}
          suggestion={suggestion}
          selected={index === selectedIndex}
          requestFavicon={requestFavicon}
          onPointerMove={(event) => onSelect(index, event)}
          onClick={() => onCommit(suggestion)}
        />
      ))}
    </ul>
  );
}
