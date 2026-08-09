import { describe, expect, it } from 'vitest';
import { closeDocSearch, hasDocSearch, queryDocSearch } from './docsearch';

// 模拟 DocSearch：点按钮异步挂载弹窗，输入后异步渲染 hit 列表。
function mountFakeDocSearch(): void {
  document.body.innerHTML = '<button class="DocSearch-Button">Search</button>';

  document.querySelector('.DocSearch-Button')!.addEventListener('click', () => {
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
});
