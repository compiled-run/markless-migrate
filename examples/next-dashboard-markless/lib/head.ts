const TITLES: [RegExp, string][] = [
	[/^\/dashboard\/invoices\/create$/, 'Create Invoice'],
	[/^\/dashboard\/invoices\/[^/]+\/edit$/, 'Edit Invoice'],
	[/^\/dashboard\/invoices$/, 'Invoices'],
	[/^\/dashboard\/customers$/, 'Customers'],
];

export function titleFor(pathname: string): string {
	const path = pathname.replace(/\/+$/, '') || '/';
	const page = TITLES.find(([pattern]) => pattern.test(path))?.[1];
	return page ? `${page} | Acme Dashboard` : 'Acme Dashboard';
}
