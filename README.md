# SearchBar

SearchBar is a command-palette-style Chrome extension for fast search, history lookup, tab switching, and custom search engine shortcuts.

## Features

- Open the overlay with `Command+K` on macOS or `Ctrl+K` on other platforms.
- Search Google by default, with Google suggestions and recent history matches.
- Type a configured search engine shortcut and press `Tab` to search with that engine.
- Switch to history mode or window mode from the overlay.
- Search open tabs and jump to the selected tab.
- Keep the UI isolated from host pages with a Shadow DOM overlay.

## Tech Stack

- Vite
- Preact
- TypeScript
- Vitest
- Chrome Extension Manifest V3

## Development

Install dependencies:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
```

Build the extension:

```bash
pnpm build
```

Start the Vite dev server:

```bash
pnpm dev
```

## Load In Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the generated `dist` directory.

## Project Structure

```text
src/
  background/   Chrome extension service worker and browser API handlers
  content/      Page content script and overlay mount lifecycle
  options/      Extension options page
  overlay/      SearchBar UI components and styling
  shared/       Message types, ranking, search engines, and shared utilities
```
