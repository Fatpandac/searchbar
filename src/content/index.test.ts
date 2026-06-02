import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentController, isEditableTarget } from './index';

const controllers: ReturnType<typeof createContentController>[] = [];

function trackController(controller: ReturnType<typeof createContentController>) {
  controllers.push(controller);
  return controller;
}

describe('isEditableTarget', () => {
  it('detects form fields and contenteditable elements', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });
});

describe('createContentController', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete (window as Window & { __searchbar_mounted__?: boolean }).__searchbar_mounted__;
  });

  afterEach(() => {
    for (const controller of controllers) {
      controller.stop();
      controller.unmount();
    }
    controllers.length = 0;
  });

  it('mounts one open shadow host and unmounts cleanly', () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const attachShadow = vi.spyOn(HTMLElement.prototype, 'attachShadow');
    attachShadow.mockImplementation(function (this: HTMLElement, init: ShadowRootInit) {
      return document.createElement('div') as unknown as ShadowRoot;
    });

    const controller = trackController(createContentController({ renderOverlay: render, destroyOverlay: destroy }));

    controller.mount();
    controller.mount();

    expect(attachShadow).toHaveBeenCalledWith({ mode: 'open' });
    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect((window as Window & { __searchbar_mounted__?: boolean }).__searchbar_mounted__).toBe(true);

    controller.unmount();

    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(0);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect((window as Window & { __searchbar_mounted__?: boolean }).__searchbar_mounted__).toBe(false);

    attachShadow.mockRestore();
  });

  it('toggles from Cmd/Ctrl+K when focus is not editable', () => {
    const controller = trackController(createContentController({ renderOverlay: vi.fn(), destroyOverlay: vi.fn() }));
    controller.start();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(1);
  });

  it('swallows page printable keyboard input while mounted without synthesizing text', () => {
    const focusOverlay = vi.fn();
    const handleKeyboardEvent = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);
    pageInput.focus();

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: focusOverlay, handleKeyboardEvent })),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    const event = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    pageInput.dispatchEvent(event);

    expect(focusOverlay).toHaveBeenCalled();
    expect(handleKeyboardEvent).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
  });

  it('forwards page control keys while mounted so overlay shortcuts still work', () => {
    const focusOverlay = vi.fn();
    const handleKeyboardEvent = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: focusOverlay, handleKeyboardEvent })),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });

    pageInput.dispatchEvent(event);

    expect(focusOverlay).toHaveBeenCalled();
    expect(handleKeyboardEvent).toHaveBeenCalledWith(event);
  });

  it('closes directly on page Escape while mounted', () => {
    const focusOverlay = vi.fn();
    const handleKeyboardEvent = vi.fn();
    const destroy = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: focusOverlay, handleKeyboardEvent })),
        destroyOverlay: destroy
      })
    );

    controller.start();
    controller.mount();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    pageInput.dispatchEvent(event);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(0);
    expect(handleKeyboardEvent).not.toHaveBeenCalled();
    expect(focusOverlay).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
  });

  it('closes directly on overlay Escape before the input handles it', () => {
    const handleKeyboardEvent = vi.fn();
    const destroy = vi.fn();
    let overlayInput: HTMLInputElement | undefined;

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn((root) => {
          overlayInput = document.createElement('input');
          root.appendChild(overlayInput);
          return { focus: vi.fn(), handleKeyboardEvent };
        }),
        destroyOverlay: destroy
      })
    );

    controller.start();
    controller.mount();

    const input = overlayInput;
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!input) {
      throw new Error('overlay input was not mounted');
    }

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    input.dispatchEvent(event);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(0);
    expect(handleKeyboardEvent).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
  });

  it('lets keyboard events from inside the overlay shadow root use the native input path', () => {
    const handleKeyboardEvent = vi.fn();
    let overlayInput: HTMLInputElement | undefined;

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn((root) => {
          overlayInput = document.createElement('input');
          root.appendChild(overlayInput);
          return { focus: vi.fn(), handleKeyboardEvent };
        }),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    const event = new KeyboardEvent('keydown', {
      key: 'g',
      bubbles: true,
      cancelable: true,
      composed: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

    const input = overlayInput;
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!input) {
      throw new Error('overlay input was not mounted');
    }
    input.dispatchEvent(event);

    expect(handleKeyboardEvent).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('swallows other page input events while mounted', () => {
    const handleKeyboardEvent = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: vi.fn(), handleKeyboardEvent })),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    const events = [
      new KeyboardEvent('keypress', { key: 'g', bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { key: 'g', bubbles: true, cancelable: true }),
      new InputEvent('beforeinput', { data: 'g', bubbles: true, cancelable: true }),
      new InputEvent('input', { data: 'g', bubbles: true, cancelable: true }),
      new CompositionEvent('compositionstart', { data: 'g', bubbles: true, cancelable: true }),
      new CompositionEvent('compositionupdate', { data: 'g', bubbles: true, cancelable: true }),
      new CompositionEvent('compositionend', { data: 'g', bubbles: true, cancelable: true }),
      new Event('paste', { bubbles: true, cancelable: true })
    ];

    for (const event of events) {
      const preventDefault = vi.spyOn(event, 'preventDefault');
      const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

      pageInput.dispatchEvent(event);

      expect(preventDefault).toHaveBeenCalled();
      expect(stopImmediatePropagation).toHaveBeenCalled();
    }

    expect(handleKeyboardEvent).not.toHaveBeenCalled();
  });

  it('swallows page IME text events while mounted without synthesizing text into the overlay', () => {
    const handleKeyboardEvent = vi.fn();
    const handleInputEvent = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: vi.fn(), handleKeyboardEvent, handleInputEvent })),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    const events = [
      new CompositionEvent('compositionstart', { data: 'n', bubbles: true, cancelable: true }),
      new CompositionEvent('compositionupdate', { data: 'ni', bubbles: true, cancelable: true }),
      new CompositionEvent('compositionend', { data: '你', bubbles: true, cancelable: true }),
      new InputEvent('beforeinput', { data: '好', bubbles: true, cancelable: true }),
      new InputEvent('input', { data: '吗', bubbles: true, cancelable: true })
    ];

    for (const event of events) {
      const preventDefault = vi.spyOn(event, 'preventDefault');
      const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');

      pageInput.dispatchEvent(event);

      expect(preventDefault).toHaveBeenCalled();
      expect(stopImmediatePropagation).toHaveBeenCalled();
    }

    expect(handleInputEvent).not.toHaveBeenCalled();
    expect(handleKeyboardEvent).not.toHaveBeenCalled();
  });

  it('does not forward latin keydown text while an IME composition is active', () => {
    const handleKeyboardEvent = vi.fn();
    const handleInputEvent = vi.fn();
    const pageInput = document.createElement('input');
    document.body.append(pageInput);

    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(() => ({ focus: vi.fn(), handleKeyboardEvent, handleInputEvent })),
        destroyOverlay: vi.fn()
      })
    );

    controller.start();
    controller.mount();

    pageInput.dispatchEvent(new CompositionEvent('compositionstart', { data: 'w', bubbles: true, cancelable: true }));
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }));
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }));
    pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
    const compositionEnd = new CompositionEvent('compositionend', {
      data: '我',
      bubbles: true,
      cancelable: true
    });
    pageInput.dispatchEvent(compositionEnd);
    pageInput.dispatchEvent(new InputEvent('beforeinput', { data: '我', bubbles: true, cancelable: true }));
    pageInput.dispatchEvent(new InputEvent('input', { data: '我', bubbles: true, cancelable: true }));

    expect(handleKeyboardEvent).not.toHaveBeenCalled();
    expect(handleInputEvent).not.toHaveBeenCalled();
  });

  it('ignores fallback hotkey inside editable targets', () => {
    const controller = trackController(createContentController({ renderOverlay: vi.fn(), destroyOverlay: vi.fn() }));
    const input = document.createElement('input');
    document.body.append(input);
    controller.start();

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );

    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(0);
  });

  it('toggles when the background sends a TOGGLE message', () => {
    let listener: ((message: unknown) => void) | undefined;
    const runtime = {
      onMessage: {
        addListener: vi.fn((callback) => {
          listener = callback;
        })
      }
    };
    const controller = trackController(
      createContentController({
        renderOverlay: vi.fn(),
        destroyOverlay: vi.fn(),
        runtime: runtime as unknown as typeof chrome.runtime
      })
    );

    controller.start();
    listener?.({ type: 'TOGGLE' });

    expect(document.querySelectorAll('[data-searchbar-host="true"]')).toHaveLength(1);
  });
});
