import { Connection } from './firebase.ts';

export const DATABASE_HOST = 'hacker-news.firebaseio.com';
export const API = 'v0';
export const ITEMS_PER_PAGE = 30;
export const SITE_TITLE = 'React HN';
export const UPDATES_CACHE_SIZE = 500;
export const VERSION = '1.7.1';

export interface Item {
	readonly id: number;
	readonly type?: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
	readonly by?: string;
	readonly time?: number;
	readonly text?: string;
	readonly title?: string;
	readonly url?: string;
	readonly score?: number;
	readonly descendants?: number;
	readonly kids?: readonly number[];
	readonly parts?: readonly number[];
	readonly parent?: number;
	readonly dead?: boolean;
	readonly deleted?: boolean;
}

export interface User {
	readonly id: string;
	readonly created: number;
	readonly karma: number;
	readonly delay?: number;
	readonly about?: string;
}

let connection: Connection | undefined;

/** The page's one socket to the HN database, opened on first use and kept across in-app navigations. */
export function database(): Connection {
	connection ??= new Connection(DATABASE_HOST);
	return connection;
}

export const itemPath = (id: number | string) => `${API}/item/${id}`;
export const userPath = (id: string) => `${API}/user/${id}`;
export const listPath = (type: string) => `${API}/${type}`;
export const UPDATES_PATH = `${API}/updates/items`;

export function pluralise(howMany: number | undefined, suffixes = ',s'): string {
	return suffixes.split(',')[howMany === 1 ? 0 : 1] ?? '';
}

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

/** The value and unit react-timeago 3.1.3 shows for a date, measured against `now`. */
export function timeParts(
	then: number,
	now: number,
): { value: number; unit: string; suffix: string } {
	const seconds = Math.round(Math.abs(now - then) / 1000);
	const suffix = then < now ? 'ago' : 'from now';
	const [value, unit] =
		seconds < MINUTE
			? [Math.round(seconds), 'second']
			: seconds < HOUR
				? [Math.round(seconds / MINUTE), 'minute']
				: seconds < DAY
					? [Math.round(seconds / HOUR), 'hour']
					: seconds < WEEK
						? [Math.round(seconds / DAY), 'day']
						: seconds < MONTH
							? [Math.round(seconds / WEEK), 'week']
							: seconds < YEAR
								? [Math.round(seconds / MONTH), 'month']
								: [Math.round(seconds / YEAR), 'year'];
	return { value, unit, suffix };
}

export function timeAgo(then: number, now: number): string {
	const { value, unit, suffix } = timeParts(then, now);
	return `${value} ${unit}${value === 1 ? '' : 's'} ${suffix}`;
}

/** The "in the last ..." form Item uses for the time since the last visit. */
export function timeUnitsAgo(then: number, now: number): string {
	const { value, unit } = timeParts(then, now);
	return value === 1 ? unit : `${value} ${unit}s`;
}

export function isoTime(ms: number): string {
	return new Date(ms).toISOString();
}

export function timeTitle(ms: number): string {
	return new Date(ms).toISOString().substr(0, 16).replace('T', ' ');
}

/** How often react-timeago re-renders a date of this age; 0 when it stops. */
export function tickPeriod(then: number, now: number): number {
	const seconds = Math.round(Math.abs(now - then) / 1000);
	return seconds < MINUTE
		? 1000
		: seconds < HOUR
			? 1000 * MINUTE
			: seconds < DAY
				? 1000 * HOUR
				: 0;
}

export function parseHost(url: string): string {
	let hostname = '';
	try {
		hostname = new URL(url).hostname;
	} catch {
		return '';
	}
	const parts = hostname.split('.').slice(-3);
	if (parts[0] === 'www') parts.shift();
	return parts.join('.');
}

export function pageTitle(title?: string): string {
	return title ? `${title} | ${SITE_TITLE}` : SITE_TITLE;
}

export function pageNumber(search: string): number {
	const page = new URLSearchParams(search).get('page');
	return page && /^\d+$/.test(page) ? Math.max(1, Number(page)) : 1;
}

export function pageCalc(pageNum: number, pageSize: number, numItems: number) {
	const startIndex = (pageNum - 1) * pageSize;
	const endIndex = Math.min(numItems, startIndex + pageSize);
	const hasNext = endIndex < numItems - 1;
	return { pageNum, startIndex, endIndex, hasNext };
}

export interface Settings {
	autoCollapse: boolean;
	replyLinks: boolean;
	showDead: boolean;
	showDeleted: boolean;
	titleFontSize: number | string;
	listSpacing: number | string;
}

export const DEFAULT_SETTINGS: Settings = {
	autoCollapse: true,
	replyLinks: true,
	showDead: false,
	showDeleted: false,
	titleFontSize: 18,
	listSpacing: 16,
};

export function loadSettings(): Settings {
	try {
		const json = localStorage.getItem('settings');
		return json ? { ...DEFAULT_SETTINGS, ...JSON.parse(json) } : { ...DEFAULT_SETTINGS };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(settings: Settings): void {
	const { autoCollapse, replyLinks, showDead, showDeleted, titleFontSize, listSpacing } =
		settings;
	localStorage.setItem(
		'settings',
		JSON.stringify({
			autoCollapse,
			replyLinks,
			showDead,
			showDeleted,
			titleFontSize,
			listSpacing,
		}),
	);
}

export interface Visit {
	readonly lastVisit: number | null;
	readonly commentCount: number;
	readonly maxCommentId: number;
}

export const NO_VISIT: Visit = { lastVisit: null, commentCount: 0, maxCommentId: 0 };

/** What the old app kept in localStorage under the story's id after a visit. */
export function loadVisit(id: number | string): Visit {
	try {
		const json = localStorage.getItem(String(id));
		return json ? (JSON.parse(json) as Visit) : NO_VISIT;
	} catch {
		return NO_VISIT;
	}
}

export function storeVisit(id: number, visit: Visit): void {
	localStorage.setItem(String(id), JSON.stringify(visit));
}

/** Ids of every story a visit was stored for, newest first: the Read Stories list. */
export function readStoryIds(): number[] {
	return Object.keys(localStorage)
		.filter((key) => /^\d+$/.test(key))
		.map(Number)
		.sort((a, b) => b - a);
}

export function readSession<T>(key: string, fallback: T): T {
	try {
		const json = sessionStorage.getItem(key);
		return json ? (JSON.parse(json) as T) : fallback;
	} catch {
		return fallback;
	}
}
