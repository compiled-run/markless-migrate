import { arrow, pageItems } from './pagination.ts';

type InvoicesPage = Awaited<ReturnType<typeof import('../server/pages.ts').invoicesPage>>;
type CustomersPage = Awaited<ReturnType<typeof import('../server/pages.ts').customersPage>>;

// The page's own URL: the request on the server, the address bar in the browser (pages never read their props there).
async function here(): Promise<URL> {
	if (import.meta.env.SSR) return new URL((await import('nitro/context')).useRequest().url);
	return new URL(window.location.href);
}

// The search string a list was asked for: '' until the reader types, then the address bar's.
export async function loadInvoices(_search: string, _version: number) {
	const url = await here();
	const query = url.searchParams.get('query') ?? '';
	const currentPage = Number(url.searchParams.get('page')) || 1;
	let page: InvoicesPage;
	if (import.meta.env.SSR) page = await (await import('../server/pages.ts')).invoicesPage(query, currentPage);
	else {
		const response = await fetch(`/api/data/invoices?${new URLSearchParams({ query, page: String(currentPage) })}`);
		if (!response.ok) throw new Error('Failed to fetch invoices.');
		page = (await response.json()) as InvoicesPage;
	}
	return { ...page, items: pageItems(url.pathname, url.search, currentPage, page.totalPages), left: arrow(url.pathname, url.search, 'left', currentPage, page.totalPages), right: arrow(url.pathname, url.search, 'right', currentPage, page.totalPages) };
}

export async function loadCustomers(_search: string) {
	const query = (await here()).searchParams.get('query') ?? '';
	if (import.meta.env.SSR) return (await import('../server/pages.ts')).customersPage(query);
	const response = await fetch(`/api/data/customers?${new URLSearchParams({ query })}`);
	if (!response.ok) throw new Error('Failed to fetch customer table.');
	return (await response.json()) as CustomersPage;
}

export async function loadQuery() {
	return { query: (await here()).searchParams.get('query') ?? '' };
}

export async function loadOverview() {
	if (!import.meta.env.SSR) throw new Error('The dashboard renders on the server.');
	return (await import('../server/pages.ts')).overview();
}

export async function loadCreate() {
	if (!import.meta.env.SSR) throw new Error('The form renders on the server.');
	return (await import('../server/pages.ts')).createPage();
}

export async function loadEdit(id: string) {
	if (!import.meta.env.SSR) throw new Error('The form renders on the server.');
	return (await import('../server/pages.ts')).editPage(id);
}
