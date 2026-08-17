import { render } from 'preact';
import { App } from '../overlay/App';
import '../overlay/overlay.css';

/**
 * Cmd+T 后 Chrome 把键盘焦点留在 omnibox，页面加载早期的 focus() 会被它盖掉。
 * omnibox 持焦时 document.hasFocus() 为 false，轮询到页面真正拿到焦点为止。
 */
export function grabFocusFromOmnibox(doc: Document = document, timeoutMs = 1000, intervalMs = 50): void {
  const start = Date.now();
  const timer = setInterval(() => {
    if (doc.hasFocus() || Date.now() - start > timeoutMs) {
      clearInterval(timer);
      return;
    }

    doc.querySelector('input')?.focus({ preventScroll: true });
  }, intervalMs);
}

const root = document.getElementById('root');

if (root) {
  // 新标签页里搜索栏是页面本身，没有「关闭」概念：
  // Escape / 点击空白只把焦点收回输入框。
  const refocus = () => {
    document.querySelector('input')?.focus({ preventScroll: true });
  };

  // 新标签页本身就是空白页，Enter 直接在当前标签页跳转；Ctrl+Enter 仍可反向开新标签页。
  render(<App onClose={refocus} loadDefaultOpenTarget={() => Promise.resolve('currentTab')} />, root);
  grabFocusFromOmnibox();
}
