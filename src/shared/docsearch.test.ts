import { describe, expect, it } from 'vitest';
import { closeDocSearch, hasDocSearch, queryDocSearch } from './docsearch';

// 模拟 DocSearch：点按钮异步挂载弹窗，输入后异步渲染 hit 列表。
function mountFakeDocSearch(buttonHtml = '<button class="DocSearch-Button">Search</button>'): void {
  document.body.innerHTML = buttonHtml;

  document.querySelector('button')!.addEventListener('click', () => {
    setTimeout(() => {
      const container = document.createElement('div');
      container.className = 'DocSearch-Container';
      container.innerHTML = '<input class="DocSearch-Input" /><div class="DocSearch-Hits"></div>';
      container.addEventListener('mousedown', (event) => {
        if (event.target === event.currentTarget) {
          container.remove();
        }
      });
      document.body.append(container);

      const input = container.querySelector<HTMLInputElement>('.DocSearch-Input')!;
      input.addEventListener('input', () => {
        setTimeout(() => {
          container.querySelector('.DocSearch-Hits')!.innerHTML = `
            <li class="DocSearch-Hit">
              <a href="https://docs.example.com/${input.value}">
                <span class="DocSearch-Hit-title">${input.value} guide</span>
                <span class="DocSearch-Hit-path">Guides</span>
              </a>
            </li>`;
        }, 30);
      });
    }, 30);
  });
}

describe('queryDocSearch', () => {
  it('returns nothing when the page has no DocSearch', async () => {
    document.body.innerHTML = '';
    expect(hasDocSearch()).toBe(false);
    expect(await queryDocSearch('router')).toEqual([]);
  });

  it('drives the page DocSearch modal and reads its hits', async () => {
    mountFakeDocSearch();
    expect(hasDocSearch()).toBe(true);

    expect(await queryDocSearch('router')).toEqual([
      {
        type: 'search',
        title: 'router guide',
        url: 'https://docs.example.com/router',
        description: 'Guides',
        provider: 'DocSearch'
      }
    ]);

    const container = document.querySelector<HTMLElement>('.DocSearch-Container')!;
    expect(container.style.opacity).toBe('0');

    closeDocSearch();
    expect(document.querySelector('.DocSearch-Container')).toBeNull();
  });

  // react.dev 式：无 .DocSearch-Button，只有 algolia preconnect + 自定义搜索按钮。
  it('detects and drives custom-button DocSearch sites like react.dev', async () => {
    mountFakeDocSearch('<button aria-label="Search" type="button">🔍</button>');
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="preconnect" href="https://1FCF9AYYAT-dsn.algolia.net" />'
    );

    try {
      expect(hasDocSearch()).toBe(true);

      expect(await queryDocSearch('hooks')).toEqual([
        {
          type: 'search',
          title: 'hooks guide',
          url: 'https://docs.example.com/hooks',
          description: 'Guides',
          provider: 'DocSearch'
        }
      ]);
    } finally {
      document.head.querySelector('link[rel="preconnect"]')?.remove();
    }
  });

  it('does not treat a plain search button without algolia as DocSearch', () => {
    document.body.innerHTML = '<button aria-label="Search">🔍</button>';
    expect(hasDocSearch()).toBe(false);
  });

  // DocSearch v2（docsearch.js，如 typescriptlang.org）：页面输入框 + autocomplete 下拉，没有 modal。
  it('drives a v2 autocomplete input and reads the dropdown hits', async () => {
    document.body.innerHTML = `
      <span class="algolia-autocomplete">
        <input id="search-box-top" type="search" placeholder="Search Docs" />
      </span>`;

    const input = document.querySelector<HTMLInputElement>('#search-box-top')!;
    input.addEventListener('input', () => {
      setTimeout(() => {
        let dropdown = document.querySelector('.ds-dropdown-menu');
        if (!dropdown) {
          dropdown = document.createElement('div');
          dropdown.className = 'ds-dropdown-menu';
          document.querySelector('.algolia-autocomplete')!.append(dropdown);
        }
        dropdown.innerHTML = `
          <div class="ds-suggestion">
            <a href="https://www.typescriptlang.org/docs/${input.value}">
              <span class="algolia-docsearch-suggestion--title">${input.value} docs</span>
              <span class="algolia-docsearch-suggestion--subcategory-column-text">Handbook</span>
            </a>
          </div>`;
      }, 30);
    });

    expect(hasDocSearch()).toBe(true);
    expect(await queryDocSearch('generics')).toEqual([
      {
        type: 'search',
        title: 'generics docs',
        url: 'https://www.typescriptlang.org/docs/generics',
        description: 'Handbook',
        provider: 'DocSearch'
      }
    ]);

    // 下拉被隐藏，不在页面上闪现
    const dropdown = document.querySelector<HTMLElement>('.ds-dropdown-menu')!;
    expect(dropdown.style.opacity).toBe('0');

    // close 时擦掉填进页面输入框的词
    closeDocSearch();
    expect(input.value).toBe('');
  });
});
