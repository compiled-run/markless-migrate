// fumadocs-core 16.10.5's useDocsSearch({ type: 'fetch' }), as components/command-menu.tsx uses it: a search waits 100 ms
// (its delayMs), an empty one answers "empty" without asking, and each answer of /api/search is kept by its URL.

export interface SearchResult {
	readonly id: string;
	readonly type: 'page' | 'heading' | 'text';
	readonly content: string;
	readonly url: string;
}

const answers = new Map<string, readonly SearchResult[]>();

async function fetchSearch(query: string): Promise<readonly SearchResult[]> {
	const url = new URL('/api/search', location.origin);
	url.searchParams.set('query', query);
	const key = url.toString();
	const cached = answers.get(key);
	if (cached) return cached;
	const response = await fetch(url);
	if (!response.ok) throw new Error(await response.text());
	const result = (await response.json()) as readonly SearchResult[];
	answers.set(key, result);
	return result;
}

// command-menu.tsx's SearchResults: a text result of one word is left out, and a result whose content an earlier one has.
const unique = (data: readonly SearchResult[]) => data.filter((item, index, self) => !(item.type === 'text' && item.content.trim().split(/\s+/).length <= 1) && index === self.findIndex((t) => t.content === item.content));

/** What the palette lists under Search Results for `query`: none while the query is blank (SearchResults renders nothing). */
export async function searchDocs(query: string): Promise<readonly SearchResult[]> {
	if (query.length === 0) return [];
	await new Promise((resolve) => setTimeout(resolve, 100));
	const results = unique(await fetchSearch(query));
	return query.trim() ? results : [];
}

let typing = 0;
/**
 * command-menu.tsx's handleSearchChange: once 500 ms pass with no newer input, the field gets `searchsettle`, whose
 * handler gives the search what was typed.
 */
export function settleTyping(field: EventTarget | null): void {
	clearTimeout(typing);
	typing = window.setTimeout(() => field?.dispatchEvent(new Event('searchsettle')), 500);
}
