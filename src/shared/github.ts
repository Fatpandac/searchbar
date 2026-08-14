import type { SearchResult } from './messages';

const HIT_LIMIT = 8;
// ponytail: 无上限的进程内缓存，overlay 关掉就没了；真撑大了再换 LRU。
const cache = new Map<string, SearchResult[]>();

type Hit = {
  hl_name?: string;
  hl_trunc_description?: string;
  followers?: number;
  language?: string;
  repo?: { repository?: { name?: string; owner_login?: string } };
};

export function hasGitHubSearch(loc: Pick<Location, 'hostname'> = location): boolean {
  return loc.hostname === 'github.com';
}

/**
 * 不劫持 DOM、也不打 api.github.com（未认证 10 次/分钟，按 IP 算，很容易被限流）。
 * content script 就跑在 github.com 上，同源 fetch 浏览器会自动带上登录 cookie，
 * 命中的是 GitHub 搜索页给自己 SPA 用的 JSON 分支，配额跟正常浏览页面一样。
 */
export async function queryGitHub(query: string, fetchImpl = fetch): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const cached = cache.get(trimmed);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetchImpl(
      `https://github.com/search?type=repositories&q=${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
    );
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {
      payload?: { blackbirdSearchRoute?: { results?: Hit[] } };
    };
    const results = (body.payload?.blackbirdSearchRoute?.results ?? [])
      .map(toResult)
      .filter((result): result is SearchResult => result !== null)
      .slice(0, HIT_LIMIT);

    cache.set(trimmed, results);
    return results;
  } catch {
    return [];
  }
}

function toResult(hit: Hit): SearchResult | null {
  const owner = hit.repo?.repository?.owner_login;
  const name = hit.repo?.repository?.name;
  if (!owner || !name) {
    return null;
  }

  const stars = hit.followers ? `★ ${hit.followers}` : '';
  const description = [stars, hit.language, plain(hit.hl_trunc_description)]
    .filter(Boolean)
    .join(' · ');

  return {
    type: 'search',
    title: plain(hit.hl_name) || `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    description: description || undefined,
    provider: 'GitHub'
  };
}

/** 命中的字段是高亮过的 HTML 片段（<em> + 实体），解析成纯文本再用，不往 DOM 里插。 */
function plain(html: string | undefined): string {
  if (!html) {
    return '';
  }

  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}
