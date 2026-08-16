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
  isMac?: boolean;
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

/**
 * 移除带焦点的 shadow host 后，Chrome 会让文档处于「没有焦点元素」的状态，
 * 整页从此收不到任何键盘事件，连普通字母都丢，必须刷页。
 * body 默认不可聚焦，所以临时给个 tabindex 把焦点收回来，再把属性擦掉。
 * blur() 没用，它只会把焦点变成「没有」，正是这个坏状态本身。
 */
function restorePageFocus(): void {
  const body = document.body;
  const active = document.activeElement;

  if (!body || (active instanceof HTMLElement && active !== body)) {
    return;
  }

  const hadTabIndex = body.hasAttribute('tabindex');
  if (!hadTabIndex) {
    body.tabIndex = -1;
  }

  body.focus({ preventScroll: true });

  if (!hadTabIndex) {
    body.removeAttribute('tabindex');
  }
}

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
  const isMac = options.isMac ?? /Mac|iP(hone|ad|od)/.test(navigator.platform);
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
    restorePageFocus();
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
    // 按平台取修饰键：macOS 上开关键是 Cmd+K，Ctrl+K 留给 overlay 做「上移选中」；
    // 其他平台开关键才是 Ctrl+K。
    const isSummon =
      isKeyDown &&
      event.key.toLowerCase() === 'k' &&
      (isMac ? event.metaKey : event.ctrlKey) &&
      !event.altKey;

    // 开关键必须排在所有早退之前无条件抢占：
    // - 焦点在页面输入框时（如 GitHub 命令面板），不能被 isEditableTarget 丢掉，否则召不出来；
    // - 焦点在 overlay 自己里时，不能被 isEventFromOverlay 丢掉，否则关不掉。
    // 我们是 document_start 注册的 capture 监听器，比页面自己的快捷键早，抢得到。
    if (isSummon) {
      markCapturedInputEvent(event);
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      toggle();
      return;
    }

    if (state) {
      if (isEventFromOverlay(event, state.host)) {
        return;
      }

      markCapturedInputEvent(event);
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
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

    // 关闭态下除了开关键不拦截任何输入，页面自己的键位照常工作。
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
