import type { SearchResult } from './messages';

const HIT_LIMIT = 8;
const WAIT_TIMEOUT_MS = 1000;
const WAIT_STEP_MS = 50;

export function hasDocSearch(doc: Document = document): boolean {
  return Boolean(doc.querySelector('.DocSearch-Button, .DocSearch-Input'));
}

/**
 * 劫持页面自带的 DocSearch：把它的弹窗打开并藏起来，替它填 query，再把渲染出来的
 * 结果读回自己的建议列表。这样不需要 Algolia 的 appId / apiKey / indexName。
 */
export async function queryDocSearch(query: string, doc: Document = document): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || !hasDocSearch(doc)) {
    return [];
  }

  const input = await openDocSearch(doc);
  if (!input) {
    return [];
  }

  const before = hitSignature(doc);
  setReactInputValue(input, trimmed);

  // 结果是异步渲染的，等到 hit 列表和上一轮不同为止；超时就用当前 DOM 里的内容。
  const hits = await waitFor(() => (hitSignature(doc) === before ? null : readHits(doc)));
  return hits ?? readHits(doc);
}

export function closeDocSearch(doc: Document = document): void {
  // DocSearch 的遮罩层是 mousedown 时判断 target === currentTarget 才关闭。
  doc
    .querySelector<HTMLElement>('.DocSearch-Container')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

async function openDocSearch(doc: Document): Promise<HTMLInputElement | null> {
  const existing = doc.querySelector<HTMLInputElement>('.DocSearch-Input');
  if (existing) {
    return existing;
  }

  doc.querySelector<HTMLElement>('.DocSearch-Button')?.click();
  const input = await waitFor(() => doc.querySelector<HTMLInputElement>('.DocSearch-Input'));
  hideDocSearch(doc);
  return input;
}

function hideDocSearch(doc: Document): void {
  const container = doc.querySelector<HTMLElement>('.DocSearch-Container');
  if (!container) {
    return;
  }

  // 只用内联样式隐藏，DocSearch 自己关闭时整个容器会被移除，不需要清理。
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
}

function readHits(doc: Document): SearchResult[] {
  return [...doc.querySelectorAll<HTMLAnchorElement>('.DocSearch-Hit a[href]')]
    .slice(0, HIT_LIMIT)
    .map((anchor) => ({
      type: 'search' as const,
      title: text(anchor, '.DocSearch-Hit-title') || anchor.textContent?.trim() || anchor.href,
      url: anchor.href,
      description: text(anchor, '.DocSearch-Hit-path') || undefined,
      provider: 'DocSearch'
    }));
}

function hitSignature(doc: Document): string {
  const hits = [...doc.querySelectorAll<HTMLAnchorElement>('.DocSearch-Hit a[href]')]
    .map((anchor) => `${anchor.href}|${anchor.textContent?.trim() ?? ''}`)
    .join('\n');
  const empty = doc.querySelector('.DocSearch-NoResults') ? 'no-results' : '';

  return `${empty}${hits}`;
}

function text(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? '';
}

function setReactInputValue(input: HTMLInputElement, value: string): void {
  // DocSearch 的输入框是 React 受控组件，必须走原生 setter 才能让 React 感知到变化。
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);

  const event = new InputEvent('input', { bubbles: true, data: value });
  // 与 content/index.ts 的 __searchbarCaptured 标记一致，否则会被自己的全局捕获处理器吃掉。
  Object.defineProperty(event, '__searchbarCaptured', { value: true });
  input.dispatchEvent(event);
}

async function waitFor<T>(read: () => T | null): Promise<T | null> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  for (;;) {
    const value = read();
    if (value) {
      return value;
    }

    if (Date.now() >= deadline) {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
}
