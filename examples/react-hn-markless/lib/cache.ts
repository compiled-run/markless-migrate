import { readSession, UPDATES_CACHE_SIZE, type Item } from './hn.ts';

// The old app's StoryStore and UpdatesStore caches: module state for in-app navigations, sessionStorage across reloads.
let idCache: Record<string, number[]> | undefined;
let itemCache: Record<number, Item> | undefined;
let updatesCache: { comments: Record<number, Item>; stories: Record<number, Item> } | undefined;

function load(): void {
	if (idCache) return;
	idCache = readSession('idCache', {});
	itemCache = readSession('itemCache', {});
	updatesCache = readSession('updates', { comments: {}, stories: {} });
}

export function cachedIds(type: string): number[] {
	load();
	return idCache![type] ?? [];
}

export function cacheIds(type: string, ids: number[]): void {
	load();
	idCache![type] = ids;
}

export function cachedItem(id: number): Item | undefined {
	load();
	return itemCache![id] ?? updatesCache!.comments[id] ?? updatesCache!.stories[id];
}

export function cachedStory(id: number): Item | undefined {
	load();
	return itemCache![id] ?? updatesCache!.stories[id];
}

export function cacheItem(item: Item): void {
	load();
	itemCache![item.id] = item;
}

export function updates(): { comments: Item[]; stories: Item[] } {
	load();
	return { comments: sorted(updatesCache!.comments), stories: sorted(updatesCache!.stories) };
}

const DISPLAYABLE = new Set(['comment', 'job', 'poll', 'story']);

/** The old UpdatesStore's handleUpdateItems: deleted and undisplayable items skipped, the oldest evicted past the cache size. */
export function addUpdates(items: readonly Item[]): void {
	load();
	for (const item of items) {
		if (!item || item.deleted || !DISPLAYABLE.has(item.type ?? '')) continue;
		(item.type === 'comment' ? updatesCache!.comments : updatesCache!.stories)[item.id] = item;
	}
	sorted(updatesCache!.comments);
	sorted(updatesCache!.stories);
}

function sorted(cache: Record<number, Item>): Item[] {
	const items = Object.values(cache).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
	for (const evicted of items.splice(UPDATES_CACHE_SIZE)) delete cache[evicted.id];
	return items;
}

/** Writes the caches to sessionStorage, as the old App did before every unload. */
export function saveSession(): void {
	load();
	sessionStorage.setItem('idCache', JSON.stringify(idCache));
	sessionStorage.setItem('itemCache', JSON.stringify(itemCache));
	sessionStorage.setItem('updates', JSON.stringify(updatesCache));
}

let saving = false;

/** Saves the caches on every unload of the page, once per document. */
export function saveOnUnload(): void {
	if (saving) return;
	saving = true;
	addEventListener('beforeunload', saveSession);
}
