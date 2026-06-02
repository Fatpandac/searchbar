import type { Ref } from 'preact';

type SearchBarProps = {
  query: string;
  modeLabel: string;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
  onInput: (query: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

export function SearchBar({ query, modeLabel, hint, inputRef, onInput, onKeyDown }: SearchBarProps) {
  return (
    <label className="searchbar-input-wrap">
      <span className="searchbar-mode">{modeLabel}</span>
      <span className="searchbar-input-slot">
        <input
          ref={inputRef}
          autoFocus
          role="combobox"
          aria-label="Search or switch tabs"
          aria-expanded="true"
          value={query}
          placeholder={placeholderForMode(modeLabel)}
          onInput={(event) => {
            event.stopPropagation();
            onInput(event.currentTarget.value);
          }}
          onBeforeInput={stopOverlayInputEvent}
          onCompositionStart={stopOverlayInputEvent}
          onCompositionUpdate={stopOverlayInputEvent}
          onCompositionEnd={stopOverlayInputEvent}
          onKeyDown={(event) => {
            event.stopPropagation();
            onKeyDown(event);
          }}
          onKeyPress={stopOverlayInputEvent}
          onKeyUp={stopOverlayInputEvent}
          onPaste={stopOverlayInputEvent}
        />
        {hint ? <span className="searchbar-input-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

function stopOverlayInputEvent(event: Event): void {
  event.stopPropagation();
}

function placeholderForMode(modeLabel: string): string {
  if (modeLabel === 'Window') {
    return 'Search current window tabs';
  }

  if (modeLabel === 'History') {
    return 'Search browsing history';
  }

  return `Search ${modeLabel}`;
}
