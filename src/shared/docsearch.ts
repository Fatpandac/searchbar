import type { SearchResult } from './messages';

const HIT_LIMIT = 8;
const WAIT_TIMEOUT_MS = 1000;
// 首次打开要等懒加载的 docsearch chunk（react.dev 式），比等结果渲染宽松些。
const OPEN_TIMEOUT_MS = 3000;
const WAIT_STEP_MS = 50;

export function hasDocSearch(doc: Document = document): boolean {
  // v3（按钮+modal）或 v2（docsearch.js 给现有输入框挂 autocomplete 下拉，如 typescriptlang.org）。
  if (doc.querySelector('.DocSearch-Button, .DocSearch-Input, .algolia-autocomplete input')) {
    return true;
  }

  // react.dev 式接入：DocSearch modal 懒加载、按钮是自定义样式（无标准类名），
  // 页面上只有 algolia 的 preconnect。用「preconnect + 自定义搜索按钮」组合判断，
  // 降低误报（只有 algolia 但不是 DocSearch 的站点最多得到一个空结果的 Docs 模式）。
  return Boolean(
    doc.querySelector('link[rel="preconnect"][href*="algolia"]') && findCustomSearchButton(doc)
  );
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

  // v2 不需要「打开」：直接往页面自己的输入框填词，下拉在旁边异步渲染。
  const input =
    doc.querySelector<HTMLInputElement>('.algolia-autocomplete input') ?? (await openDocSearch(doc));
  if (!input) {
    return [];
  }

  const before = hitSignature(doc);
  setReactInputValue(input, trimmed);

  // 结果是异步渲染的，等到 hit 列表和上一轮不同为止；超时就用当前 DOM 里的内容。
  // 每轮都补一次隐藏：v2 的下拉是结果到达后才插入 DOM 的。
  const hits = await waitFor(() => {
    hideDocSearch(doc);
    return hitSignature(doc) === before ? null : readHits(doc);
  });
  return hits ?? readHits(doc);
}

export function closeDocSearch(doc: Document = document): void {
  // DocSearch 的遮罩层是 mousedown 时判断 target === currentTarget 才关闭。
  doc
    .querySelector<HTMLElement>('.DocSearch-Container')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  // v2：把填进页面导航栏输入框的词擦掉，不给页面留痕迹。
  const v2Input = doc.querySelector<HTMLInputElement>('.algolia-autocomplete input');
  if (v2Input?.value) {
    setReactInputValue(v2Input, '');
  }
}

async function openDocSearch(doc: Document): Promise<HTMLInputElement | null> {
  const existing = doc.querySelector<HTMLInputElement>('.DocSearch-Input');
  if (existing) {
    return existing;
  }

  const trigger =
    doc.querySelector<HTMLElement>('.DocSearch-Button') ?? findCustomSearchButton(doc);
  trigger?.click();
  const input = await waitFor(
    () => doc.querySelector<HTMLInputElement>('.DocSearch-Input'),
    OPEN_TIMEOUT_MS
  );
  hideDocSearch(doc);
  return input;
}

function findCustomSearchButton(doc: Document): HTMLElement | null {
  // click() 对 display:none 的按钮照样触发 React handler，所以移动端隐藏按钮也能用。
  return doc.querySelector<HTMLElement>('button[aria-label*="search" i]');
}

function hideDocSearch(doc: Document): void {
  // v3 modal 整体隐藏；v2 隐藏挂在页面输入框下的下拉。只用内联样式，
  // 它们自己关闭/重建时会移除节点，不需要清理。
  for (const el of doc.querySelectorAll<HTMLElement>('.DocSearch-Container, .ds-dropdown-menu')) {
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
  }
}

// v3 和 v2 的 hit 选择器合并查询，同一页面只会存在其中一种。
const HIT_SELECTOR = '.DocSearch-Hit a[href], .ds-suggestion a[href]';
const HIT_TITLE_SELECTOR = '.DocSearch-Hit-title, .algolia-docsearch-suggestion--title';
const HIT_PATH_SELECTOR =
  '.DocSearch-Hit-path, .algolia-docsearch-suggestion--subcategory-column-text';
const NO_RESULTS_SELECTOR = '.DocSearch-NoResults, .algolia-docsearch-suggestion--no-results';

function readHits(doc: Document): SearchResult[] {
  return [...doc.querySelectorAll<HTMLAnchorElement>(HIT_SELECTOR)]
    .slice(0, HIT_LIMIT)
    .map((anchor) => ({
      type: 'search' as const,
      title: text(anchor, HIT_TITLE_SELECTOR) || anchor.textContent?.trim() || anchor.href,
      url: anchor.href,
      description: text(anchor, HIT_PATH_SELECTOR) || undefined,
      provider: 'DocSearch'
    }));
}

function hitSignature(doc: Document): string {
  const hits = [...doc.querySelectorAll<HTMLAnchorElement>(HIT_SELECTOR)]
    .map((anchor) => `${anchor.href}|${anchor.textContent?.trim() ?? ''}`)
    .join('\n');
  const empty = doc.querySelector(NO_RESULTS_SELECTOR) ? 'no-results' : '';

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

async function waitFor<T>(read: () => T | null, timeoutMs = WAIT_TIMEOUT_MS): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;

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
