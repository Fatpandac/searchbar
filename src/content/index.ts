import type { SearchRequest } from '../shared/messages';
import {
  destroyOverlay,
  isForwardedKeyboardEvent,
  type OverlayHandle,
  renderOverlay
} from '../overlay/main';

declare global {
  interface Window {
    __searchbar_mounted__?: boolean;
  }
}

type RenderOverlay = (root: ParentNode, options: { onClose: () => void }) => OverlayHandle | void;
type DestroyOverlay = (root: ParentNode) => void;

type ContentControllerOptions = {
  renderOverlay?: RenderOverlay;
  destroyOverlay?: DestroyOverlay;
  runtime?: typeof chrome.runtime;
};

type HostState = {
  host: HTMLDivElement;
  root: ShadowRoot;
  overlay?: OverlayHandle;
};

const OWNED_INPUT_EVENT_TYPES = [
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

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
    return true;
  }

  return false;
}

export function createContentController(options: ContentControllerOptions = {}) {
  const render = options.renderOverlay ?? renderOverlay;
  const destroy = options.destroyOverlay ?? destroyOverlay;
  let state: HostState | null = null;
  let started = false;
  let compositionActive = false;

  const unmount = () => {
    compositionActive = false;
    if (!state) {
      window.__searchbar_mounted__ = false;
      return;
    }

    destroy(state.root);
    state.host.remove();
    state = null;
    window.__searchbar_mounted__ = false;
  };

  const mount = () => {
    if (state || window.__searchbar_mounted__) {
      return;
    }

    const host = document.createElement('div');
    host.dataset.searchbarHost = 'true';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const root = host.attachShadow({ mode: 'open' });
    document.documentElement.append(host);
    window.__searchbar_mounted__ = true;
    state = { host, root, overlay: render(root, { onClose: unmount }) ?? undefined };
  };

  const toggle = () => {
    if (state || window.__searchbar_mounted__) {
      unmount();
      return;
    }

    mount();
  };

  const onOwnedInputEvent = (event: Event) => {
    if (event instanceof KeyboardEvent && isForwardedKeyboardEvent(event)) {
      return;
    }

    if (isCapturedInputEvent(event)) {
      return;
    }

    const isKeyDown = event instanceof KeyboardEvent && event.type === 'keydown';
    const isSummon =
      isKeyDown && event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
    
    // Alternative activation: Cmd+Shift+K (works even when Cmd+K is taken by the page)
    const isAlternativeSummon =
      isKeyDown && event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && event.shiftKey;

    if (state) {
      if (isEventFromOverlay(event, state.host)) {
        return;
      }

      markCapturedInputEvent(event);
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      if (isSummon && !event.altKey) {
        toggle();
        return;
      }

      state.overlay?.focus();

      if (event.type === 'compositionstart') {
        compositionActive = true;
        return;
      }

      if (event.type === 'compositionupdate') {
        compositionActive = true;
        return;
      }

      if (event instanceof KeyboardEvent && (compositionActive || event.isComposing)) {
        return;
      }

      if (event.type === 'compositionend') {
        compositionActive = false;
        return;
      }

      if (shouldForwardOwnedInputEvent(event)) {
        state.overlay?.handleKeyboardEvent(event);
      }
      return;
    }

    // Alternative activation shortcut bypasses editable element check
    if (isAlternativeSummon && !event.altKey) {
      markCapturedInputEvent(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
      return;
    }

    if (!isKeyDown || !isSummon || event.altKey || event.shiftKey || isEditableTarget(event.target)) {
      return;
    }

    markCapturedInputEvent(event);
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  };

  const onMessage = (message: SearchRequest) => {
    if (message.type === 'TOGGLE') {
      toggle();
    }
  };

  const start = () => {
    if (started) {
      return;
    }

    started = true;
    for (const eventType of OWNED_INPUT_EVENT_TYPES) {
      window.addEventListener(eventType, onOwnedInputEvent, true);
      document.addEventListener(eventType, onOwnedInputEvent, true);
    }
    options.runtime?.onMessage.addListener(onMessage);
  };

  const stop = () => {
    if (!started) {
      return;
    }

    started = false;
    for (const eventType of OWNED_INPUT_EVENT_TYPES) {
      window.removeEventListener(eventType, onOwnedInputEvent, true);
      document.removeEventListener(eventType, onOwnedInputEvent, true);
    }
  };

  return {
    mount,
    unmount,
    toggle,
    start,
    stop
  };
}

function shouldForwardOwnedInputEvent(event: Event): event is KeyboardEvent {
  if (event instanceof KeyboardEvent) {
    return event.type === 'keydown' && !isPrintableKey(event);
  }

  return false;
}

function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function isEventFromOverlay(event: Event, host: HTMLElement): boolean {
  if (event.target === host) {
    return true;
  }

  if (typeof event.composedPath === 'function') {
    return event.composedPath().includes(host);
  }

  return false;
}

function isCapturedInputEvent(event: Event): boolean {
  return Boolean((event as Event & { __searchbarCaptured?: boolean }).__searchbarCaptured);
}

function markCapturedInputEvent(event: Event): void {
  Object.defineProperty(event, '__searchbarCaptured', {
    value: true
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  createContentController({ runtime: chrome.runtime }).start();
}
