import { replaceSearch } from './forms.ts';

export function searchParam(search: string, name: string): string {
	return new URLSearchParams(search).get(name) ?? '';
}

// The old Search component: log, reset to page 1, set or drop the query, replace the URL.
export function nextSearch(term: string): string {
	console.log(`Searching... ${term}`);
	const params = new URLSearchParams(window.location.search);
	params.set('page', '1');
	if (term) params.set('query', term);
	else params.delete('query');
	replaceSearch({ page: '1', query: term || undefined });
	return `?${params.toString()}`;
}

export function pageUrl(pathname: string, search: string, page: number | string): string {
	const params = new URLSearchParams(search);
	params.set('page', page.toString());
	return `${pathname}?${params.toString()}`;
}
