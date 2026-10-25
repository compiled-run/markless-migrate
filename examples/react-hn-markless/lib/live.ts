import {
	addUpdates,
	cachedIds,
	cachedItem,
	cachedStory,
	cacheIds,
	cacheItem,
	saveOnUnload,
	updates as currentUpdates,
} from './cache.ts';
import {
	database,
	itemPath,
	ITEMS_PER_PAGE,
	listPath,
	loadSettings,
	loadVisit,
	pageCalc,
	pageTitle,
	readStoryIds,
	storeVisit,
	UPDATES_PATH,
	userPath,
	type Item,
	type Settings,
	type User,
	type Visit,
} from './hn.ts';
import {
	collapseWithoutNew,
	followed,
	loaded,
	stats,
	type Flags,
	type Items,
	type Thread,
	type ThreadVisit,
} from './thread.ts';

type Stop = () => void;

/** Coalesces writes that arrive in one burst of socket messages into one state write. */
function coalesce<T>(write: (value: T) => void): (value: T) => void {
	let pending: { value: T } | undefined;
	return (value) => {
		const first = !pending;
		pending = { value };
		if (first)
			setTimeout(() => {
				const { value: latest } = pending!;
				pending = undefined;
				write(latest);
			});
	};
}

/** Listens to every id in `want`, and stops listening to ids no longer wanted. */
class Listens {
	private readonly stops = new Map<number, Stop>();
	constructor(private readonly onValue: (id: number, value: Item | null) => void) {}

	want(ids: Iterable<number>): void {
		const wanted = new Set(ids);
		for (const [id, stop] of this.stops)
			if (!wanted.has(id)) {
				stop();
				this.stops.delete(id);
			}
		for (const id of wanted)
			if (!this.stops.has(id))
				this.stops.set(
					id,
					database().listen(itemPath(id), (value) =>
						this.onValue(id, (value as Item | null) ?? null),
					),
				);
	}

	stop(): void {
		for (const stop of this.stops.values()) stop();
		this.stops.clear();
	}
}

export interface StoriesView {
	readonly ids: number[] | null;
	readonly items: Items;
	readonly visits: Readonly<Record<number, Visit>>;
	readonly settings: Settings;
	readonly limit: number;
}

/** A story list page: its ids live from the list's path (or the stored visits for Read), the page's stories live from their own paths. */
export function followStories(
	type: string,
	page: number,
	limit: number,
	title: string | undefined,
	write: (view: StoriesView) => void,
): Stop {
	saveOnUnload();
	document.title = pageTitle(title);
	const settings = loadSettings();
	let ids: number[] | null = type === 'read' ? null : cachedIds(type);
	const items: Record<number, Item | null> = {};
	const visits: Record<number, Visit> = {};
	const flush = coalesce(write);
	const emit = () =>
		flush({
			ids,
			items: { ...items },
			visits: { ...visits },
			settings,
			limit: ids && (type === 'read' || ids.length) ? ids.length : limit,
		});
	const listens = new Listens((id, value) => {
		items[id] = value;
		if (value) cacheItem(value);
		emit();
	});
	const onPage = () => {
		const { startIndex, endIndex } = pageCalc(page, ITEMS_PER_PAGE, ids?.length || limit);
		const shown = (ids ?? []).slice(startIndex, endIndex);
		for (const id of shown) {
			visits[id] = loadVisit(id);
			if (!(id in items)) {
				const cached = cachedItem(id);
				if (cached) items[id] = cached;
			}
		}
		listens.want(shown);
		emit();
	};
	let stopIds: Stop | undefined;
	if (type === 'read')
		setTimeout(() => {
			ids = readStoryIds();
			onPage();
		});
	else
		stopIds = database().listen(listPath(type), (value) => {
			ids = (value as number[] | null) ?? [];
			cacheIds(type, ids);
			onPage();
		});
	onPage();
	const onStorage = (event: StorageEvent) => {
		if (event.key && /^\d+$/.test(event.key) && Number(event.key) in visits) {
			visits[Number(event.key)] = loadVisit(event.key);
			emit();
		}
	};
	addEventListener('storage', onStorage);
	return () => {
		stopIds?.();
		listens.stop();
		removeEventListener('storage', onStorage);
	};
}

export interface ThreadState {
	readonly items: Items;
	readonly visit: ThreadVisit;
	readonly settings: Settings;
	readonly loading: boolean;
}

/** A story's comment thread: the story and every comment it renders, each live, with the old store's first-load and visit bookkeeping. */
export function followThread(
	rootId: number,
	write: (state: ThreadState) => void,
	collapse: (flags: Flags) => void,
): Stop {
	saveOnUnload();
	const settings = loadSettings();
	const stored = loadVisit(rootId);
	let visit: ThreadVisit = {
		lastVisit: stored.lastVisit,
		prevMaxCommentId: stored.maxCommentId,
		firstVisit: stored.lastVisit === null,
	};
	const items: Record<number, Item | null> = {};
	const cached = cachedStory(rootId);
	if (cached) items[rootId] = cached;
	let loading = true;
	let fromCache = Boolean(cached);
	const flush = coalesce(write);
	const view = (): Thread => ({
		rootId,
		items,
		visit,
		settings,
		highlighted: null,
		collapsed: {},
	});
	const store = () => {
		const root = items[rootId];
		if (!root) return;
		storeVisit(rootId, {
			lastVisit: Date.now(),
			commentCount: root.descendants ?? 0,
			maxCommentId: stats(view()).maxCommentId,
		});
	};
	const emit = () => flush({ items: { ...items }, visit, settings, loading });
	if (cached) document.title = pageTitle(cached.title);
	const listens = new Listens((id, value) => {
		items[id] = value;
		if (id === rootId) {
			if (value?.title && (fromCache || !document.title.startsWith(value.title)))
				document.title = pageTitle(value.title);
			fromCache = false;
		}
		listens.want(wanted());
		if (loading && !fromCache && loaded({ rootId, items, settings })) {
			loading = false;
			const { maxCommentId, newCommentCount } = stats(view());
			if (visit.firstVisit)
				visit = {
					lastVisit: Date.now(),
					prevMaxCommentId: maxCommentId,
					firstVisit: false,
				};
			else if (settings.autoCollapse && newCommentCount > 0)
				collapse(collapseWithoutNew(view()));
			store();
		}
		emit();
	});
	const wanted = () => {
		const ids = followed(rootId, items, settings);
		const root = items[rootId];
		if (root?.type === 'poll') ids.push(...(root.parts ?? []));
		return ids;
	};
	listens.want(wanted());
	emit();
	addEventListener('beforeunload', store);
	return () => {
		store();
		listens.stop();
		removeEventListener('beforeunload', store);
	};
}

/** Marks the thread read as the old store did: now is the last visit, and every comment loaded so far is old. */
export function markRead(rootId: number, state: ThreadState): ThreadVisit {
	const thread: Thread = {
		rootId,
		items: state.items,
		visit: state.visit,
		settings: state.settings,
		highlighted: null,
		collapsed: {},
	};
	const { maxCommentId } = stats(thread);
	const root = state.items[rootId];
	storeVisit(rootId, {
		lastVisit: Date.now(),
		commentCount: root?.descendants ?? 0,
		maxCommentId,
	});
	return { lastVisit: Date.now(), prevMaxCommentId: maxCommentId, firstVisit: false };
}

export interface UpdatesView {
	readonly comments: Item[];
	readonly stories: Item[];
	readonly settings: Settings;
	readonly ancestry: Readonly<Record<number, Ancestry>>;
}

/** The "comments" page: the changed-items feed, each changed item fetched once, kept newest first, with the shown comments' parent and story. */
export function followUpdates(page: number, write: (view: UpdatesView) => void): Stop {
	saveOnUnload();
	document.title = pageTitle('New Comments');
	const settings = loadSettings();
	const flush = coalesce(write);
	const ancestry: Record<number, Ancestry> = {};
	let stopped = false;
	const emit = () => {
		const { comments, stories } = currentUpdates();
		const shown = comments.filter((c) => !c.dead || settings.showDead);
		const { startIndex, endIndex } = pageCalc(page, ITEMS_PER_PAGE, shown.length);
		for (const comment of shown.slice(startIndex, endIndex)) {
			if (comment.id in ancestry) continue;
			ancestry[comment.id] = { parent: null, op: null };
			ancestors(comment).then((found) => {
				if (stopped) return;
				ancestry[comment.id] = found;
				emit();
			});
		}
		flush({ comments: shown, stories, settings, ancestry: { ...ancestry } });
	};
	if (currentUpdates().comments.length) emit();
	const stop = database().listen(UPDATES_PATH, (value) => {
		const ids = (value as number[] | null) ?? [];
		Promise.all(ids.map((id) => database().once<Item | null>(itemPath(id)))).then((items) => {
			if (stopped) return;
			addUpdates(items.filter((item): item is Item => Boolean(item)));
			emit();
		});
	});
	return () => {
		stopped = true;
		stop();
	};
}

export interface Ancestry {
	readonly parent: { id: number; type: string } | null;
	readonly op: Item | null;
}

const parentOf = new Map<number, number>();
const titles = new Map<number, Item>();

/** The old ItemStore's fetchCommentAncestors: walks a comment's parents to its story, skipping every link it has walked before. */
export async function ancestors(comment: Item): Promise<Ancestry> {
	let parent: Ancestry['parent'] = null;
	let count = 0;
	let childId = comment.id;
	let parentId = comment.parent;
	for (;;) {
		while (parentId !== undefined && (parentOf.has(parentId) || titles.has(parentId))) {
			count++;
			const op = titles.get(parentId);
			if (op)
				return {
					parent: count === 1 ? { id: op.id, type: op.type ?? 'story' } : parent,
					op,
				};
			if (count === 1) parent = { id: parentId, type: 'comment' };
			childId = parentId;
			parentId = parentOf.get(parentId);
		}
		if (parentId === undefined) return { parent, op: null };
		const next: Item | null =
			cachedItem(parentId) ?? (await database().once<Item | null>(itemPath(parentId)));
		count++;
		parentOf.set(childId, parentId);
		if (!next) return { parent, op: null };
		if (count === 1) parent = { id: next.id, type: next.type ?? 'comment' };
		if (next.type !== 'comment') {
			titles.set(next.id, { id: next.id, type: next.type, title: next.title });
			return { parent, op: next };
		}
		if (next.parent !== undefined) parentOf.set(next.id, next.parent);
		childId = next.id;
		parentId = next.parent;
	}
}

export function followUser(id: string, write: (user: User | null) => void): Stop {
	return database().listen(userPath(id), (value) => {
		const user = (value as User | null) ?? null;
		if (user?.id) document.title = pageTitle(`Profile: ${user.id}`);
		write(user);
	});
}

export interface PermalinkState {
	readonly items: Items;
	readonly ancestry: Ancestry;
	readonly settings: Settings;
}

/** A permalinked comment: the comment and its replies live, its parent and story looked up once, and a story id sent to the story's page. */
export function followPermalink(
	id: number,
	write: (state: PermalinkState) => void,
	redirect: (path: string) => void,
): Stop {
	saveOnUnload();
	const settings = loadSettings();
	const items: Record<number, Item | null> = {};
	const cached = cachedItem(id);
	if (cached?.type === 'comment') items[id] = cached;
	let ancestry: Ancestry = { parent: null, op: null };
	let looked = false;
	let stopped = false;
	const flush = coalesce(write);
	const emit = () => flush({ items: { ...items }, ancestry, settings });
	const title = () => {
		const comment = items[id];
		if (!comment) return;
		document.title = pageTitle(
			comment.deleted
				? 'Deleted comment'
				: `Comment by ${comment.by}${ancestry.op ? ` | ${ancestry.op.title}` : ''}`,
		);
	};
	const listens = new Listens((at, value) => {
		items[at] = value;
		if (at === id && value) {
			if (!value.deleted && value.type && value.type !== 'comment') {
				redirect(`/${value.type}/${value.id}`);
				return;
			}
			title();
			if (!looked && !value.deleted) {
				looked = true;
				ancestors(value).then((found) => {
					if (stopped) return;
					ancestry = found;
					title();
					emit();
				});
			}
		}
		listens.want(followed(id, items, settings));
		emit();
	});
	listens.want(followed(id, items, settings));
	emit();
	return () => {
		stopped = true;
		listens.stop();
	};
}
