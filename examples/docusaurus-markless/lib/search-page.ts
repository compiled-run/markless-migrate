// The /search page of theme-search-algolia: the query lives in ?q=, results come from the site's Algolia index
// (15 a page, the next page when the list's end scrolls into view), rendered with the theme's markup.
import classes from './theme-classes.json';

const ALGOLIA = { appId: 'X1Z85QJPUV', apiKey: 'bf7211c161e8205da2f933a02534105a', indexName: 'docusaurus-2' };
const s = (classes as Record<string, Record<string, string>>).SearchPage!;
type Hit = { url: string; _highlightResult: { hierarchy: Record<string, { value: string }> }; _snippetResult?: { content?: { value: string } } };
type State = { query: string; items: { title: string; url: string; summary: string; breadcrumbs: string[] }[]; totalResults: number | null; totalPages: number; lastPage: number; loading: boolean };

let state: State | undefined;
let observer: IntersectionObserver | undefined;

const sanitize = (value: string) => value.replace(/algolia-docsearch-suggestion--highlight/g, 'search-result-match');
const title = (query: string) => (query ? `Search results for "${query}"` : 'Search the documentation');
function versions(): string[] {
	return [...new Set([...document.querySelectorAll('meta[name="docsearch:docusaurus_tag"]')].map((m) => m.getAttribute('content') ?? ''))];
}

async function search(query: string, page: number): Promise<{ hits: Hit[]; nbHits: number; nbPages: number; page: number; query: string }> {
	const tags = ['docusaurus_tag:default', 'docusaurus_tag:docs-default-current', 'docusaurus_tag:docs-community-current', ...versions().filter((t) => t && t !== 'default').map((t) => `docusaurus_tag:${t}`)];
	const params = new URLSearchParams({ query, hitsPerPage: '15', page: String(page), advancedSyntax: 'true', facets: JSON.stringify(['docusaurus_tag', 'language']), facetFilters: JSON.stringify([[...new Set(tags)], ['language:en']]) });
	const res = await fetch(`https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/*/queries?x-algolia-agent=${encodeURIComponent('Algolia for JavaScript (5); Lite (5); Browser')}&x-algolia-api-key=${ALGOLIA.apiKey}&x-algolia-application-id=${ALGOLIA.appId}`, {
		method: 'POST',
		headers: { 'content-type': 'text/plain' },
		body: JSON.stringify({ requests: [{ indexName: ALGOLIA.indexName, params: params.toString() }] }),
	});
	const body = (await res.json()) as { results: { hits: Hit[]; nbHits: number; nbPages: number; page: number; query: string }[] };
	return body.results[0]!;
}

function render(container: HTMLElement): void {
	const count = container.querySelector<HTMLElement>(`.${s.searchResultsColumn}`);
	const doc = state;
	if (count) count.textContent = doc && doc.totalResults ? (doc.totalResults === 1 ? 'One document found' : `${doc.totalResults} documents found`) : '';
	container.querySelector('main')?.remove();
	container.querySelector(':scope > p, :scope > .' + s.loadingSpinner)?.remove();
	container.querySelector(`:scope > .${s.loader}`)?.remove();
	if (!doc) return;
	if (doc.items.length > 0) {
		const main = document.createElement('main');
		main.innerHTML = doc.items
			.map((item) => `<article class="${s.searchResultItem}"><h2 class="${s.searchResultItemHeading}"><a href="${item.url}">${item.title}</a></h2>${item.breadcrumbs.length ? `<nav aria-label="breadcrumbs"><ul class="breadcrumbs ${s.searchResultItemPath}">${item.breadcrumbs.map((b) => `<li class="breadcrumbs__item">${b}</li>`).join('')}</ul></nav>` : ''}${item.summary ? `<p class="${s.searchResultItemSummary}">${item.summary}</p>` : ''}</article>`)
			.join('');
		container.append(main);
	} else if (doc.query && !doc.loading) container.insertAdjacentHTML('beforeend', '<p>No results were found</p>');
	else if (doc.loading) container.insertAdjacentHTML('beforeend', `<div class="${s.loadingSpinner}"></div>`);
	if (doc.totalPages > doc.lastPage + 1 && !doc.loading) {
		container.insertAdjacentHTML('beforeend', `<div class="${s.loader}">Fetching new results...</div>`);
		const loader = container.lastElementChild!;
		let prevY = 0;
		observer?.disconnect();
		observer = new IntersectionObserver(
			([entry]) => {
				if (entry!.isIntersecting && prevY > entry!.boundingClientRect.y) void run(container, doc.query, doc.lastPage + 1);
				prevY = entry!.boundingClientRect.y;
			},
			{ threshold: 1 },
		);
		observer.observe(loader);
	}
}

let timer: ReturnType<typeof setTimeout> | undefined;
const wired = new WeakSet<Element>();
async function run(container: HTMLElement, query: string, page: number): Promise<void> {
	const result = await search(query, page);
	if (!state || state.query !== result.query) return;
	const items = result.hits.map((hit) => {
		const titles = Object.keys(hit._highlightResult.hierarchy).map((key) => sanitize(hit._highlightResult.hierarchy[key]!.value));
		return { title: titles.pop()!, url: new URL(hit.url).pathname + new URL(hit.url).hash, summary: hit._snippetResult?.content ? `${sanitize(hit._snippetResult.content.value)}...` : '', breadcrumbs: titles };
	});
	state = { query: result.query, items: page === 0 ? items : state.items.concat(items), totalResults: result.nbHits, totalPages: result.nbPages, lastPage: result.page, loading: false };
	render(container);
}

function setQuery(container: HTMLElement, query: string): void {
	document.title = `${title(query)} | Docusaurus`;
	const heading = container.querySelector('h1');
	if (heading) heading.textContent = title(query);
	const url = new URL(window.location.href);
	if (query) url.searchParams.set('q', query);
	else url.searchParams.delete('q');
	history.replaceState(history.state, '', url);
	state = query ? { query, items: [], totalResults: null, totalPages: 0, lastPage: 0, loading: true } : undefined;
	render(container);
	clearTimeout(timer);
	if (query) timer = setTimeout(() => void run(container, query, 0), 300);
}

export function init(): void {
	if (!document.documentElement.classList.contains('search-page-wrapper')) return;
	const input = document.querySelector<HTMLInputElement>(`input.${s.searchQueryInput}`);
	const container = input?.closest('.container') as HTMLElement | null;
	if (!input || !container || wired.has(input)) return;
	wired.add(input);
	input.addEventListener('input', () => setQuery(container, input.value));
	input.form?.addEventListener('submit', (event) => event.preventDefault());
	const initial = new URLSearchParams(window.location.search).get('q') ?? '';
	if (initial) {
		input.value = initial;
		setQuery(container, initial);
	}
}
