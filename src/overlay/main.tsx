import { render } from 'preact';
import { App } from './App';
import cssText from './overlay.css?inline';

export type OverlayOptions = {
  onClose: () => void;
};

export type OverlayHandle = {
  focus: () => void;
  handleKeyboardEvent: (event: KeyboardEvent) => void;
  handleInputEvent?: (event: Event) => void;
};

const containers = new WeakMap<ParentNode, HTMLElement>();
const NATIVE_INPUT_EVENT_TYPES = [
  'keydown',
  'keypress',
  'keyup',
  'beforeinput',
  'input',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'paste'
] as const;

export function renderOverlay(root: ParentNode, options: OverlayOptions): OverlayHandle {
  const style = document.createElement('style');
  style.textContent = cssText;

  const container = document.createElement('div');
  container.setAttribute('data-searchbar-root', 'true');

  root.appendChild(style);
  root.appendChild(container);
  containers.set(root, container);

  render(<App onClose={options.onClose} />, container);

  const input = () => container.querySelector('input');
  const searchInput = input();
  if (searchInput) {
    for (const eventType of NATIVE_INPUT_EVENT_TYPES) {
      searchInput.addEventListener(eventType, stopInputEventPropagation);
    }
  }
  const focus = () => {
    input()?.focus({ preventScroll: true });
  };
  let lastCompositionCommit = '';
  const handleKeyboardEvent = (event: KeyboardEvent) => {
    const target = input();

    if (!target) {
      return;
    }

    focus();

    if (event.isComposing || event.key === 'Process') {
      return;
    }

    if (isPrintableKey(event)) {
      lastCompositionCommit = '';
      insertText(target, event.key);
      return;
    }

    if (event.key === 'Backspace') {
      lastCompositionCommit = '';
      removeText(target, 'backward');
      return;
    }

    if (event.key === 'Delete') {
      lastCompositionCommit = '';
      removeText(target, 'forward');
      return;
    }

    const forwarded = new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    markForwardedEvent(forwarded);
    target.dispatchEvent(forwarded);
  };
  const handleInputEvent = (event: Event) => {
    const target = input();

    if (!target) {
      return;
    }

    focus();

    if (event instanceof KeyboardEvent) {
      handleKeyboardEvent(event);
      return;
    }

    const text = getTextFromInputEvent(event);
    if (!text) {
      return;
    }

    if (event.type === 'compositionend') {
      lastCompositionCommit = text;
    } else if (lastCompositionCommit && text === lastCompositionCommit) {
      return;
    } else {
      lastCompositionCommit = '';
    }

    insertText(target, text);
  };

  focus();
  requestAnimationFrame(focus);

  return { focus, handleKeyboardEvent, handleInputEvent };
}

export function destroyOverlay(root: ParentNode): void {
  const container = containers.get(root);
  if (container) {
    render(null, container);
    containers.delete(root);
  }

  while (root.firstChild) {
    root.firstChild.remove();
  }
}

function stopInputEventPropagation(event: Event): void {
  event.stopPropagation();
}

function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function insertText(input: HTMLInputElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const nextValue = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const nextPosition = start + text.length;

  input.value = nextValue;
  input.setSelectionRange(nextPosition, nextPosition);
  dispatchInput(input);
}

function removeText(input: HTMLInputElement, direction: 'backward' | 'forward'): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  if (start !== end) {
    input.value = `${input.value.slice(0, start)}${input.value.slice(end)}`;
    input.setSelectionRange(start, start);
    dispatchInput(input);
    return;
  }

  if (direction === 'backward' && start > 0) {
    input.value = `${input.value.slice(0, start - 1)}${input.value.slice(start)}`;
    input.setSelectionRange(start - 1, start - 1);
    dispatchInput(input);
    return;
  }

  if (direction === 'forward' && start < input.value.length) {
    input.value = `${input.value.slice(0, start)}${input.value.slice(start + 1)}`;
    input.setSelectionRange(start, start);
    dispatchInput(input);
  }
}

function dispatchInput(input: HTMLInputElement): void {
  input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: false }));
}

function getTextFromInputEvent(event: Event): string {
  if (event instanceof InputEvent && event.data) {
    return event.data;
  }

  if (event instanceof CompositionEvent && event.type === 'compositionend' && event.data) {
    return event.data;
  }

  const clipboardData = (event as ClipboardEvent).clipboardData;
  if (clipboardData && typeof clipboardData.getData === 'function') {
    return clipboardData.getData('text/plain');
  }

  return '';
}

export function isForwardedKeyboardEvent(event: KeyboardEvent): boolean {
  return Boolean((event as KeyboardEvent & { __searchbarForwarded?: boolean }).__searchbarForwarded);
}

function markForwardedEvent(event: KeyboardEvent): void {
  Object.defineProperty(event, '__searchbarForwarded', {
    value: true
  });
}
