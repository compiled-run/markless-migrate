import type { Page } from 'playwright';
import type { StorageState } from './browser.ts';
import { HINTS } from './hints.ts';
import { diffLines, lineTemplates } from './noise.ts';
import type { Dimension, Failure } from './types.ts';
import { storageCandidate, type StorageOwner } from './automatic.ts';

// Runs inside the page: the keys of its local and session storage and the IndexedDB databases and object stores it opened.
async function keysInPage(): Promise<string[]> {
	const out: string[] = [];
	for (const [label, store] of [['localStorage', () => localStorage], ['sessionStorage', () => sessionStorage]] as const) {
		try {
			const s = store();
			for (let i = 0; i < s.length; i++) out.push(`${label} ${s.key(i)}`);
		} catch {}
	}
	try {
		for (const db of (await indexedDB.databases()) ?? []) {
			if (!db.name) continue;
			const stores = await new Promise<string[]>((done) => {
				const open = indexedDB.open(db.name!);
				open.onupgradeneeded = () => open.transaction?.abort();
				open.onerror = () => done([]);
				open.onsuccess = () => {
					done([...open.result.objectStoreNames]);
					open.result.close();
				};
			});
			out.push(...(stores.length ? stores.map((s) => `indexedDB ${db.name}/${s}`) : [`indexedDB ${db.name}`]));
		}
	} catch {}
	return out;
}

/** What the page keeps in the browser, by key: local and session storage, IndexedDB stores, and the cookies its origin holds with their attributes; a role's sign-in cookies are auth's to compare. */
export async function storageKeys(page: Page, signedIn: ReadonlySet<string> = new Set()): Promise<string[]> {
	const kept = await page.evaluate(keysInPage).catch(() => [] as string[]);
	const cookies = (await page.context().cookies(page.url()).catch(() => [])).filter((c) => !signedIn.has(c.name)).map((c) => `cookie ${c.name}${c.httpOnly ? ' HttpOnly' : ''}${c.secure ? ' Secure' : ''} SameSite=${c.sameSite}${c.expires === -1 ? ' session' : ''}`);
	return [...kept, ...cookies].sort();
}

/** Keys NEW keeps that OLD did not, and keys OLD kept that NEW does not; keys that varied between OLD runs may vary alike. */
export function storageFailure(route: string, dimension: Dimension, check: string, olds: readonly (readonly string[])[], next: readonly string[], owner?: StorageOwner): Failure | undefined {
	const diff = diffLines(lineTemplates(olds[0]!, ...olds.slice(1)), next);
	const missing = [...diff.missing, ...diff.changed.map((c) => c.expected)];
	const extra = [...diff.unexpected, ...diff.changed.map((c) => c.actual)];
	if (!missing.length && !extra.length) return undefined;
	const automatic = storageCandidate(missing, extra, owner);
	return { route, dimension, check, expected: missing.length ? `kept: ${missing.join(', ')}` : '(no other keys)', actual: [missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `extra ${extra.join(', ')}` : ''].filter(Boolean).join('; '), hint: HINTS.storage, ...(automatic ? { automatic } : {}) };
}

/** The names of the cookies a role's sign-in left. */
export const signInCookies = (state: StorageState | undefined) => new Set((state?.cookies ?? []).map((c) => c.name));

/** Local storage keys a sign-in left for the app's own origin. */
export function signedInStorage(state: StorageState, origin: string): string[] {
	const own = new URL(origin).origin;
	return (state.origins ?? []).filter((o) => o.origin === own).flatMap((o) => o.localStorage.map((item) => `localStorage ${item.name}`)).sort();
}
