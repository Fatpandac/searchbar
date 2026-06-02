import { waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderOverlay, destroyOverlay } from './main';

describe('renderOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets forwarded printable keys update the search input', () => {
    const root = document.createElement('div');
    const handle = renderOverlay(root, { onClose: vi.fn() });
    const input = root.querySelector('input') as HTMLInputElement;

    handle.handleKeyboardEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        bubbles: true,
        cancelable: true
      })
    );
    handle.handleKeyboardEvent(
      new KeyboardEvent('keydown', {
        key: 'h',
        bubbles: true,
        cancelable: true
      })
    );

    expect(input.value).toBe('gh');

    destroyOverlay(root);
  });

  it('lets native IME input update the search input through the browser input path', () => {
    const root = document.createElement('div');
    const handle = renderOverlay(root, { onClose: vi.fn() });
    const input = root.querySelector('input') as HTMLInputElement;

    input.value = '你好';
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '你好', bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { data: '你好', bubbles: true }));

    expect(input.value).toBe('你好');

    destroyOverlay(root);
  });

  it('ignores composing keydown text', () => {
    const root = document.createElement('div');
    const handle = renderOverlay(root, { onClose: vi.fn() });
    const input = root.querySelector('input') as HTMLInputElement;

    handle.handleKeyboardEvent(
      new KeyboardEvent('keydown', {
        key: 'w',
        bubbles: true,
        cancelable: true,
        isComposing: true
      })
    );
    expect(input.value).toBe('');

    destroyOverlay(root);
  });

  it('keeps native input events from bubbling out of the search input', () => {
    const root = document.createElement('div');
    renderOverlay(root, { onClose: vi.fn() });
    const input = root.querySelector('input') as HTMLInputElement;
    const bubbled = vi.fn();
    root.addEventListener('keydown', bubbled);
    root.addEventListener('keypress', bubbled);
    root.addEventListener('keyup', bubbled);
    root.addEventListener('beforeinput', bubbled);
    root.addEventListener('input', bubbled);
    root.addEventListener('compositionstart', bubbled);
    root.addEventListener('compositionupdate', bubbled);
    root.addEventListener('compositionend', bubbled);
    root.addEventListener('paste', bubbled);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'w', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    input.dispatchEvent(new InputEvent('beforeinput', { data: '我', bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { data: '我', bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionstart', { data: 'w', bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'wo', bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '我', bubbles: true }));
    input.dispatchEvent(new Event('paste', { bubbles: true }));

    expect(bubbled).not.toHaveBeenCalled();

    destroyOverlay(root);
  });

  it('lets native Escape inside history search return to Google without closing', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('ignores the blur that can follow Escape returning from history search', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });
    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).not.toHaveBeenCalled();

    destroyOverlay(root);
  });

  it('ignores blur while history search is active even if Escape keydown is not delivered', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('ignores blur while window search is active even if Escape keydown is not delivered', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('Window');
    });

    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('ignores a blur fired immediately after Escape before the mode rerender finishes', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('ignores repeated blur events shortly after Escape', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new FocusEvent('blur'));
    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('lets forwarded Escape inside history search return to Google without closing', async () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    const handle = renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await waitFor(() => {
      expect(root.textContent).toContain('History');
    });

    handle.handleKeyboardEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(root.textContent).toContain('Google');
    });

    destroyOverlay(root);
  });

  it('closes on native Escape inside Google search', () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();

    destroyOverlay(root);
  });

  it('closes when the search input loses focus', () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).toHaveBeenCalledTimes(1);

    destroyOverlay(root);
  });

  it('only closes once when Escape also blurs the search input', () => {
    const root = document.createElement('div');
    const onClose = vi.fn();
    renderOverlay(root, { onClose });
    const input = root.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    );
    input.dispatchEvent(new FocusEvent('blur'));

    expect(onClose).toHaveBeenCalledTimes(1);

    destroyOverlay(root);
  });
});
