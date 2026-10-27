import { isoTime, pluralise, timeAgo, timeTitle, type Item, type Settings } from './hn.ts';

/** Every item the thread's listener has heard about: a value, or null when the API answered null. */
export type Items = Readonly<Record<number, Item | null>>;
export type Flags = Readonly<Record<number, boolean>>;

/** The visit the thread is compared with: the stored one, or the first one once its comments have loaded. */
export interface ThreadVisit {
	readonly lastVisit: number | null;
	readonly prevMaxCommentId: number;
	readonly firstVisit: boolean;
}

export interface Thread {
	readonly rootId: number;
	readonly items: Items;
	readonly visit: ThreadVisit;
	readonly settings: Settings;
	/** Comment ids highlighted by "highlight N comments", replacing the new-since-visit ones; null when not used. */
	readonly highlighted: Flags | null;
	readonly collapsed: Flags;
	/** Comments the server refused to send yet (an author's delay setting), tried again every 30 s. */
	readonly delayed?: Flags;
}

const has = (items: Items, id: number) => Object.prototype.hasOwnProperty.call(items, id);

/** Whether a comment renders the comments under it: a deleted one never does, a dead one only when the settings show dead comments. */
export function rendersKids(item: Item | null | undefined, settings: Settings): boolean {
	if (!item || item.deleted) return false;
	return !item.dead || settings.showDead;
}

/** Ids the listener follows: the root and every comment a rendered comment lists as a kid. */
export function followed(rootId: number, items: Items, settings: Settings): number[] {
	const out: number[] = [rootId];
	const root = items[rootId];
	const queue = [...(root?.kids ?? [])];
	while (queue.length) {
		const id = queue.shift()!;
		out.push(id);
		const item = items[id];
		if (rendersKids(item, settings)) queue.push(...(item!.kids ?? []));
	}
	return out;
}

/** The comments the old thread store registered: loaded, not deleted, under a rendered parent. */
function registered(thread: Pick<Thread, 'rootId' | 'items' | 'settings'>): {
	comments: Item[];
	children: Map<number, number[]>;
	parents: Map<number, number>;
} {
	const { rootId, items, settings } = thread;
	const comments: Item[] = [];
	const children = new Map<number, number[]>();
	children.set(rootId, []);
	const parents = new Map<number, number>();
	const queue: [number, number][] = [];
	for (const id of items[rootId]?.kids ?? []) queue.push([id, rootId]);
	while (queue.length) {
		const [id, parent] = queue.shift()!;
		const item = items[id];
		if (!item || item.deleted) continue;
		comments.push(item);
		children.set(id, []);
		children.get(parent)?.push(id);
		if (parent !== rootId) parents.set(id, parent);
		if (rendersKids(item, settings)) for (const kid of item.kids ?? []) queue.push([kid, id]);
	}
	return { comments, children, parents };
}

/** The old store's end of the initial load, counted as it counted: a dead comment's replies are expected but never render, so such a thread never ends it. */
export function loaded(thread: Pick<Thread, 'rootId' | 'items' | 'settings' | 'delayed'>): boolean {
	const { rootId, items, settings } = thread;
	const root = items[rootId];
	if (!root) return false;
	let expected = root.kids?.length ?? 0;
	let count = 0;
	const queue = [...(root.kids ?? [])];
	while (queue.length) {
		const id = queue.shift()!;
		if (thread.delayed?.[id]) {
			expected--;
			continue;
		}
		if (!has(items, id)) continue;
		const item = items[id];
		if (!item || item.deleted) {
			expected--;
			continue;
		}
		if (item.dead && !settings.showDead) expected--;
		else count++;
		expected += item.kids?.length ?? 0;
		if (rendersKids(item, settings)) queue.push(...(item.kids ?? []));
	}
	return count >= expected;
}

export function counted(item: Item, settings: Settings): boolean {
	return !item.dead || settings.showDead;
}

export function stats(thread: Pick<Thread, 'rootId' | 'items' | 'settings' | 'visit'>) {
	const { comments } = registered(thread);
	let commentCount = 0;
	let newCommentCount = 0;
	let maxCommentId = 0;
	for (const comment of comments) {
		if (counted(comment, thread.settings)) commentCount++;
		if (
			thread.visit.prevMaxCommentId > 0 &&
			comment.id > thread.visit.prevMaxCommentId &&
			counted(comment, thread.settings)
		)
			newCommentCount++;
		if (comment.id > maxCommentId) maxCommentId = comment.id;
	}
	return { commentCount, newCommentCount, maxCommentId };
}

export function isNew(thread: Thread, item: Item): boolean {
	if (thread.highlighted) return thread.highlighted[item.id] === true;
	return (
		thread.visit.prevMaxCommentId > 0 &&
		item.id > thread.visit.prevMaxCommentId &&
		counted(item, thread.settings)
	);
}

/** The old store's collapseThreadsWithoutNewComments: every subtree with no new comment folded, new ones and their path left open. */
export function collapseWithoutNew(thread: Thread): Flags {
	const { comments, children, parents } = registered(thread);
	const fresh = comments.filter((c) => isNew(thread, c)).map((c) => c.id);
	const hasNew = new Set<number>();
	for (const id of fresh) {
		for (
			let parent = parents.get(id);
			parent !== undefined && !hasNew.has(parent);
			parent = parents.get(parent)
		)
			hasNew.add(parent);
	}
	const freshSet = new Set(fresh);
	const out: Record<number, boolean> = {};
	let level = children.get(thread.rootId) ?? [];
	while (level.length) {
		const next: number[] = [];
		for (const id of level) {
			if (!hasNew.has(id)) {
				if (!freshSet.has(id)) out[id] = true;
			} else next.push(...(children.get(id) ?? []));
		}
		level = next;
	}
	return out;
}

/** The old store's getCommentByTimeIndex: comments sorted as strings, as Array#sort does, dead ones left out unless shown. */
export function commentByTimeIndex(thread: Thread, index: number): Item | undefined {
	const { comments } = registered(thread);
	const ids = comments.filter((c) => counted(c, thread.settings)).map((c) => c.id);
	ids.sort();
	const id = ids[index - 1];
	return comments.find((c) => c.id === id);
}

/** Ids newer than the comment at `showAfter`, as "highlight N comments" marks them. */
export function highlightSince(thread: Thread, showAfter: number): Flags {
	const reference = commentByTimeIndex(thread, showAfter);
	const out: Record<number, boolean> = {};
	if (!reference) return out;
	for (const comment of registered(thread).comments)
		if (comment.id > reference.id) out[comment.id] = true;
	return out;
}

export interface CommentRow {
	readonly key: number;
	readonly id: number;
	readonly kind: 'comment' | 'loading' | 'deleted';
	readonly className: string;
	readonly by: string;
	readonly userHref: string;
	readonly linkHref: string;
	readonly hnHref: string;
	readonly replyHref: string;
	readonly timeIso: string;
	readonly timeTitle: string;
	readonly timeText: string;
	readonly dead: boolean;
	readonly html: string;
	readonly replyLink: boolean;
	readonly collapsed: boolean;
	readonly childText: string;
	readonly childNew: number;
	readonly childClose: string;
	readonly deadText: string;
	readonly spinner: boolean;
	readonly delayed: boolean;
}

function childCounts(
	id: number,
	children: Map<number, number[]>,
	thread: Thread,
): { children: number; fresh: number } {
	let count = 0;
	let fresh = 0;
	let level = [id];
	while (level.length) {
		const next: number[] = [];
		for (const at of level) next.push(...(children.get(at) ?? []));
		for (const at of next) {
			const item = thread.items[at];
			if (item && isNew(thread, item)) fresh++;
		}
		count += next.length;
		level = next;
	}
	return { children: count, fresh };
}

/** The comment tree in document order as the old Comment components rendered it, one row per comment; a collapsed comment's descendants are left out. */
export function commentRows(
	thread: Thread,
	now: number,
	top: readonly number[] = thread.items[thread.rootId]?.kids ?? [],
): CommentRow[] {
	const { children } = registered(thread);
	const rows: CommentRow[] = [];
	const walk = (id: number, level: number, spinner: boolean) => {
		const base = `Comment--level${level}`;
		// reactfire turns a null value into a record with no id, which the old Comment renders as still loading.
		if (!has(thread.items, id) || thread.items[id] === null) {
			const delayed = thread.delayed?.[id] === true;
			rows.push({
				...empty(id, 'loading', `Comment Comment--loading ${base}`, spinner || delayed),
				delayed,
			});
			return;
		}
		const item = thread.items[id]!;
		if (item.dead && !thread.settings.showDead) return;
		if (item.deleted) {
			if (thread.settings.showDeleted)
				rows.push(empty(id, 'deleted', `Comment Comment--deleted ${base}`, false));
			return;
		}
		const fresh = isNew(thread, item);
		const collapsed = thread.collapsed[id] === true;
		const counts = collapsed ? childCounts(id, children, thread) : undefined;
		const childNew = counts && !fresh ? counts.fresh : 0;
		const className = [
			'Comment',
			base,
			collapsed ? 'Comment--collapsed' : '',
			item.dead ? 'Comment--dead' : '',
			fresh ? 'Comment--new' : '',
		]
			.filter(Boolean)
			.join(' ');
		const ms = (item.time ?? 0) * 1000;
		rows.push({
			key: id,
			id,
			kind: 'comment',
			className,
			by: item.by ?? '',
			userHref: `/user/${item.by}`,
			linkHref: `/comment/${id}`,
			hnHref: `https://news.ycombinator.com/item?id=${id}`,
			replyHref: `https://news.ycombinator.com/reply?id=${id}`,
			timeIso: isoTime(ms),
			timeTitle: timeTitle(ms),
			timeText: timeAgo(ms, now),
			dead: item.dead === true,
			html: item.text ?? '',
			replyLink: thread.settings.replyLinks && !item.dead,
			collapsed,
			childText: counts
				? ` | (${counts.children} child${pluralise(counts.children, ',ren')}${childNew > 0 ? ', ' : ''}`
				: '',
			childNew,
			childClose: counts ? ')' : '',
			deadText: item.dead ? ' | [dead]' : '',
			spinner: false,
			delayed: false,
		});
		if (!collapsed) for (const kid of item.kids ?? []) walk(kid, level + 1, spinner);
	};
	top.forEach((id, index) => walk(id, 0, index === 0));
	return rows;
}

function empty(
	id: number,
	kind: CommentRow['kind'],
	className: string,
	spinner: boolean,
): CommentRow {
	return {
		key: id,
		id,
		kind,
		className,
		by: '',
		userHref: '',
		linkHref: '',
		hnHref: `https://news.ycombinator.com/item?id=${id}`,
		replyHref: '',
		timeIso: '',
		timeTitle: '',
		timeText: '',
		dead: false,
		html: '',
		replyLink: false,
		collapsed: false,
		childText: '',
		childNew: 0,
		childClose: '',
		deadText: '',
		spinner,
		delayed: false,
	};
}

/** Times shown in the thread, so the clock can tick as react-timeago did for the youngest of them. */
export function shownTimes(thread: Thread): number[] {
	return registered(thread).comments.map((c) => (c.time ?? 0) * 1000);
}

export function toggled(flags: Flags, id: number): Flags {
	return { ...flags, [id]: !flags[id] };
}
