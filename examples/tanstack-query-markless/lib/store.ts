// The old app's mock API (src/utils/mockTodos.ts), moved to the server: one store per browser tab, created on each document load.
import type { Invoice, User, UsersSortBy } from './types.ts';

type PickAsRequired<TValue, TKey extends keyof TValue> = Omit<TValue, TKey> &
	Required<Pick<TValue, TKey>>;

interface Tab {
	id: string;
	invoices: Invoice[];
	users: User[];
	invoicesPromise?: Promise<void>;
	usersPromise?: Promise<void>;
	auth: { status: 'loggedOut' | 'loggedIn'; username?: string };
	seen: number;
}

// Nitro bundles API routes and page rendering apart, each with its own copy of this module: the tabs live on the process.
const tabs: Map<string, Tab> = ((
	globalThis as { __kitchenSinkTabs?: Map<string, Tab> }
).__kitchenSinkTabs ??= new Map());
const MAX_TABS = 2000;

export function tabFor(id: string): Tab {
	// A client with no tab (curl, a crawler) gets the seed data and keeps no writes.
	if (!id)
		return {
			id,
			invoices: null!,
			users: null!,
			auth: { status: 'loggedOut' },
			seen: Date.now(),
		};
	let tab = tabs.get(id);
	if (!tab) {
		tab = {
			id,
			invoices: null!,
			users: null!,
			auth: { status: 'loggedOut' },
			seen: Date.now(),
		};
		tabs.set(id, tab);
		if (tabs.size > MAX_TABS) tabs.delete(tabs.keys().next().value!);
	}
	tab.seen = Date.now();
	return tab;
}

export interface Delays {
	readonly loader: number;
	readonly action: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// KS_TRACE=1 logs each call of the mock API, so deploy/tanstack-query/measure.ts can count what the server fetched for a tab.
const trace = (tab: Tab, call: string) =>
	process.env.KS_TRACE &&
	console.log(`[mock] ${JSON.stringify({ tab: tab.id, call, at: Date.now() })}`);

async function loaderDelayFn<T>(delays: Delays, fn: () => Promise<T> | T): Promise<T> {
	await wait(delays.loader);
	return fn();
}

async function actionDelayFn<T>(delays: Delays, fn: () => Promise<T> | T): Promise<T> {
	await wait(delays.action);
	return fn();
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return (await res.json()) as T;
}

const ensureInvoices = async (tab: Tab) => {
	tab.invoicesPromise ??= Promise.resolve().then(async () => {
		trace(tab, 'GET jsonplaceholder.typicode.com/posts');
		const data = await getJson<Invoice[]>('https://jsonplaceholder.typicode.com/posts');
		tab.invoices = data.slice(0, 10);
	});
	await tab.invoicesPromise;
};

const ensureUsers = async (tab: Tab) => {
	tab.usersPromise ??= Promise.resolve().then(async () => {
		trace(tab, 'GET jsonplaceholder.typicode.com/users');
		const data = await getJson<User[]>('https://jsonplaceholder.typicode.com/users');
		tab.users = data.slice(0, 10);
	});
	await tab.usersPromise;
};

export function fetchInvoices(tab: Tab, delays: Delays) {
	trace(tab, 'fetchInvoices');
	return loaderDelayFn(delays, () => ensureInvoices(tab).then(() => tab.invoices));
}

export function fetchInvoiceById(tab: Tab, delays: Delays, id: number) {
	trace(tab, 'fetchInvoiceById');
	return loaderDelayFn(delays, () =>
		ensureInvoices(tab).then(() => {
			const invoice = tab.invoices.find((d) => d.id === id);
			if (!invoice) throw new Error('Invoice not found');
			return invoice;
		}),
	);
}

export function postInvoice(
	tab: Tab,
	delays: Delays,
	partialInvoice: Partial<Invoice>,
	random: () => number,
	now: number,
) {
	trace(tab, 'postInvoice');
	return actionDelayFn(delays, async () => {
		await ensureInvoices(tab);
		if (partialInvoice.title?.includes('error')) {
			console.error('error');
			throw new Error('Ouch!');
		}
		const invoice = {
			id: tab.invoices.length + 1,
			title: partialInvoice.title ?? `New Invoice ${String(now).slice(0, 5)}`,
			body: partialInvoice.body ?? shuffle(LOREM.split(' '), random).join(' '),
		};
		tab.invoices = [...tab.invoices, invoice];
		return invoice;
	});
}

export function patchInvoice(
	tab: Tab,
	delays: Delays,
	{ id, ...updatedInvoice }: PickAsRequired<Partial<Invoice>, 'id'>,
) {
	trace(tab, 'patchInvoice');
	return actionDelayFn(delays, async () => {
		await ensureInvoices(tab);
		const index = tab.invoices.findIndex((d) => d.id === id);
		if (index < 0) throw new Error('Invoice not found.');
		if (updatedInvoice.title?.toLocaleLowerCase()?.includes('error')) throw new Error('Ouch!');
		const next = { ...tab.invoices[index]!, ...updatedInvoice };
		tab.invoices = tab.invoices.map((d, i) => (i === index ? next : d));
		return next;
	});
}

export function fetchUsers(
	tab: Tab,
	delays: Delays,
	{ filterBy, sortBy }: { filterBy?: string; sortBy?: UsersSortBy } = {},
) {
	trace(tab, 'fetchUsers');
	return loaderDelayFn(delays, () =>
		ensureUsers(tab).then(() => {
			let usersDraft = tab.users;
			if (filterBy)
				usersDraft = usersDraft.filter((d) =>
					d.name.toLowerCase().includes(filterBy.toLowerCase()),
				);
			if (sortBy)
				usersDraft = [...usersDraft].sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1));
			return usersDraft;
		}),
	);
}

export function fetchUserById(tab: Tab, delays: Delays, id: number) {
	trace(tab, 'fetchUserById');
	return loaderDelayFn(delays, () =>
		ensureUsers(tab).then(() => tab.users.find((d) => d.id === id)),
	);
}

export function shuffle<T>(arr: Array<T>, random: () => number): Array<T> {
	let i = arr.length;
	if (i == 0) return arr;
	const copy = [...arr];
	while (--i) {
		const j = Math.floor(random() * (i + 1));
		const a = copy[i];
		const b = copy[j];
		copy[i] = b!;
		copy[j] = a!;
	}
	return copy;
}

const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
      Fusce ac turpis quis ligula lacinia aliquet. Mauris ipsum. Nulla metus metus, ullamcorper vel, tincidunt sed, euismod in, nibh. Quisque volutpat condimentum velit. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nam nec ante. 
      Vestibulum sapien. Proin quam. Etiam ultrices. Suspendisse in justo eu magna luctus suscipit. Sed lectus. Integer euismod lacus luctus magna.  Integer id quam. Morbi mi. Quisque nisl felis, venenatis tristique, dignissim in, ultrices sit amet, augue. Proin sodales libero eget ante.
      `;
