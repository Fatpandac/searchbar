import type { Suggestion } from '../shared/messages';
import { SuggestionItem } from './SuggestionItem';

type SuggestionListProps = {
  suggestions: Suggestion[];
  selectedIndex: number;
  emptyLabel: string;
  onSelect: (index: number) => void;
  onCommit: (suggestion: Suggestion) => void;
};

export function SuggestionList({
  suggestions,
  selectedIndex,
  emptyLabel,
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
          onPointerEnter={() => onSelect(index)}
          onClick={() => onCommit(suggestion)}
        />
      ))}
    </ul>
  );
}
