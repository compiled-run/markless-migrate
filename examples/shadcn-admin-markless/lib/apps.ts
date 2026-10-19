// features/apps: the app list, its filter and sort, and the route's search params as TanStack Router reads and writes them.
export type AppType = 'all' | 'connected' | 'notConnected';
export type AppSort = 'asc' | 'desc';

export interface App {
	readonly name: string;
	readonly connected: boolean;
	readonly desc: string;
}

export const APPS: readonly App[] = [
	{ name: "Telegram", connected: false, desc: "Connect with Telegram for real-time communication." },
	{ name: "Notion", connected: true, desc: "Effortlessly sync Notion pages for seamless collaboration." },
	{ name: "Figma", connected: true, desc: "View and collaborate on Figma designs in one place." },
	{ name: "Trello", connected: false, desc: "Sync Trello cards for streamlined project management." },
	{ name: "Slack", connected: false, desc: "Integrate Slack for efficient team communication" },
	{ name: "Zoom", connected: true, desc: "Host Zoom meetings directly from the dashboard." },
	{ name: "Stripe", connected: false, desc: "Easily manage Stripe transactions and payments." },
	{ name: "Gmail", connected: true, desc: "Access and manage Gmail messages effortlessly." },
	{ name: "Medium", connected: false, desc: "Explore and share Medium stories on your dashboard." },
	{ name: "Skype", connected: false, desc: "Connect with Skype contacts seamlessly." },
	{ name: "Docker", connected: false, desc: "Effortlessly manage Docker containers on your dashboard." },
	{ name: "GitHub", connected: false, desc: "Streamline code management with GitHub integration." },
	{ name: "GitLab", connected: false, desc: "Efficiently manage code projects with GitLab integration." },
	{ name: "Discord", connected: false, desc: "Connect with Discord for seamless team communication." },
	{ name: "WhatsApp", connected: false, desc: "Easily integrate WhatsApp for direct messaging." },
];

export interface AppsSearch {
	readonly filter: string;
	readonly type: AppType;
	readonly sort: AppSort;
}

export function filteredApps(filter: string, type: string, sort: string): App[] {
	return [...APPS]
		.sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))
		.filter((app) => (type === 'connected' ? app.connected : type === 'notConnected' ? !app.connected : true))
		.filter((app) => app.name.toLowerCase().includes(filter.toLowerCase()));
}

const BUTTON = "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

export function connectClass(connected: boolean): string {
	return connected
		? `${BUTTON} shadow-xs hover:text-accent-foreground h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 border border-blue-300 bg-blue-50 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900`
		: `${BUTTON} border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5`;
}

// TanStack Router's default search (de)serialisation: each value is JSON when it parses as JSON, else the raw string.
function parseValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function validate(key: string, value: unknown): string | undefined {
	if (key === 'filter') return typeof value === 'string' ? value : '';
	if (key === 'type') return value === 'all' || value === 'connected' || value === 'notConnected' ? value : undefined;
	if (key === 'sort') return value === 'asc' || value === 'desc' ? value : undefined;
	return undefined;
}

/** The validated search params in the order the URL holds them. */
export function readSearch(search: string): [string, string][] {
	const out: [string, string][] = [];
	for (const part of search.replace(/^\?/, '').split('&')) {
		if (!part) continue;
		const at = part.indexOf('=');
		const key = decodeURIComponent(at < 0 ? part : part.slice(0, at));
		const value = validate(key, parseValue(decodeURIComponent(at < 0 ? '' : part.slice(at + 1).replace(/\+/g, ' '))));
		if (value !== undefined && !out.some(([k]) => k === key)) out.push([key, value]);
	}
	return out;
}

export function initialSearch(search: string): AppsSearch {
	const entries = readSearch(search);
	const get = (key: string) => entries.find(([k]) => k === key)?.[1];
	return { filter: get('filter') ?? '', type: (get('type') ?? 'all') as AppType, sort: (get('sort') ?? 'asc') as AppSort };
}

function encodeValue(value: string): string {
	let parses = true;
	try {
		JSON.parse(value);
	} catch {
		parses = false;
	}
	return encodeURIComponent(parses ? JSON.stringify(value) : value).replace(/%20/g, '+');
}

/** navigate({ search: (prev) => ({ ...prev, [key]: value }) }): an undefined value drops the key. */
export function navigateSearch(key: 'filter' | 'type' | 'sort', value: string | undefined): void {
	const entries = readSearch(location.search);
	const at = entries.findIndex(([k]) => k === key);
	if (value === undefined || value === '') {
		if (at >= 0) entries.splice(at, 1);
	} else if (at >= 0) entries[at] = [key, value];
	else entries.push([key, value]);
	const query = entries.filter(([, v]) => v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeValue(v)}`).join('&');
	history.pushState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}`);
}
