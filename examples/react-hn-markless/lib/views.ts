import {
	isoTime,
	ITEMS_PER_PAGE,
	pageCalc,
	parseHost,
	pluralise,
	timeAgo,
	timeTitle,
	timeUnitsAgo,
	type Item,
	type Settings,
	type User,
	type Visit,
} from './hn.ts';
import {
	commentByTimeIndex,
	commentRows,
	isNew,
	stats,
	type CommentRow,
	type Flags,
	type Thread,
} from './thread.ts';
import type { PermalinkState, StoriesView, UpdatesView } from './live.ts';

export interface Meta {
	readonly job: boolean;
	readonly score: string;
	readonly scoreValue: string;
	readonly scorePlural: string;
	readonly by: string;
	readonly userHref: string;
	readonly timeIso: string;
	readonly timeTitle: string;
	readonly timeText: string;
	readonly itemHref: string;
	readonly comments: string;
}

export interface Title {
	readonly dead: boolean;
	readonly text: string;
	readonly linkText: string;
	readonly deadText: string;
	readonly href: string;
	readonly external: boolean;
	readonly host: string;
	readonly style: string;
}

export function itemHref(item: Pick<Item, 'id' | 'type'>): string {
	return `/${item.type}/${item.id}`;
}

export function title(item: Item, settings: Settings): Title {
	const external = Boolean(item.url);
	return {
		dead: item.dead === true,
		text: item.dead ? `[dead] ${item.title ?? ''}` : (item.title ?? ''),
		linkText: item.dead ? '' : (item.title ?? ''),
		deadText: item.dead ? `[dead] ${item.title ?? ''}` : '',
		href: item.url || itemHref(item),
		external,
		host: external ? parseHost(item.url!) : '',
		style: `font-size: ${settings.titleFontSize}px;`,
	};
}

export function meta(item: Item, now: number): Meta {
	const ms = (item.time ?? 0) * 1000;
	const descendants = item.descendants ?? 0;
	return {
		job: item.type === 'job',
		score: `${item.score} point${pluralise(item.score)}`,
		scoreValue: String(item.score),
		scorePlural: pluralise(item.score),
		by: item.by ?? '',
		userHref: `/user/${item.by}`,
		timeIso: isoTime(ms),
		timeTitle: timeTitle(ms),
		timeText: timeAgo(ms, now),
		itemHref: itemHref(item),
		comments: descendants > 0 ? `${descendants} comment${pluralise(descendants)}` : 'discuss',
	};
}

export interface StoryRow {
	readonly key: string;
	readonly loading: boolean;
	readonly className: string;
	readonly spacing: string;
	readonly title: Title;
	readonly meta: Meta;
	readonly newComments: number;
}

const NO_TITLE: Title = {
	dead: false,
	text: '',
	linkText: '',
	deadText: '',
	href: '',
	external: false,
	host: '',
	style: '',
};
const NO_META: Meta = {
	job: false,
	score: '',
	scoreValue: '',
	scorePlural: '',
	by: '',
	userHref: '',
	timeIso: '',
	timeTitle: '',
	timeText: '',
	itemHref: '',
	comments: '',
};

export interface StoriesPage {
	readonly start: number;
	readonly rows: StoryRow[];
	readonly page: number;
	readonly hasNext: boolean;
	readonly empty: boolean;
	readonly blank: boolean;
	readonly prevHref: string;
	readonly nextHref: string;
}

/** The old Stories component: one row per id on the page, a spinner until its story loads, deleted stories left out. */
export function storiesPage(
	view: StoriesView,
	type: string,
	route: string,
	page: number,
	now: number,
): StoriesPage {
	const calc = pageCalc(page, ITEMS_PER_PAGE, view.limit);
	const spacing = `margin-bottom: ${view.settings.listSpacing}px;`;
	const rows: StoryRow[] = [];
	if (type === 'read' && (view.ids === null || view.ids.length === 0))
		return {
			start: calc.startIndex + 1,
			rows,
			page: calc.pageNum,
			hasNext: calc.hasNext,
			empty: view.ids !== null,
			blank: view.ids === null,
			prevHref: '',
			nextHref: '',
		};
	for (let i = calc.startIndex; i < calc.endIndex; i++) {
		const id = view.ids?.[i];
		const item = id === undefined ? undefined : view.items[id];
		if (!item || !item.id) {
			rows.push({
				key: id === undefined ? `slot${i}` : String(id),
				loading: true,
				className: 'ListItem ListItem--loading',
				spacing,
				title: NO_TITLE,
				meta: NO_META,
				newComments: 0,
			});
			continue;
		}
		if (item.deleted) continue;
		const visit: Visit | undefined = view.visits[item.id];
		const newComments =
			visit && visit.lastVisit !== null ? (item.descendants ?? 0) - visit.commentCount : 0;
		rows.push({
			key: String(item.id),
			loading: false,
			className: item.dead ? 'ListItem ListItem--dead' : 'ListItem',
			spacing,
			title: title(item, view.settings),
			meta: meta(item, now),
			newComments,
		});
	}
	return {
		start: calc.startIndex + 1,
		rows,
		page: calc.pageNum,
		hasNext: calc.hasNext,
		empty: false,
		blank: false,
		prevHref: `/${route}?page=${calc.pageNum - 1}`,
		nextHref: `/${route}?page=${calc.pageNum + 1}`,
	};
}

export interface ItemHeader {
	readonly ready: boolean;
	readonly className: string;
	readonly title: Title;
	readonly meta: Meta;
	readonly newCount: number;
	readonly lastVisitIso: string;
	readonly lastVisitTitle: string;
	readonly lastVisitText: string;
	readonly sliderStyle: string;
	readonly sliderMax: number;
	readonly sliderValue: number;
	readonly highlightText: string;
	readonly highlightIso: string;
	readonly highlightTitle: string;
	readonly highlightAgo: string;
	readonly html: string;
	readonly poll: boolean;
	readonly hasKids: boolean;
}

/** The old Item component's story half: title, meta with the new-comment controls, the highlight slider, text and poll. */
export function itemHeader(
	thread: Thread,
	loading: boolean,
	showAfter: number,
	now: number,
): ItemHeader {
	const item = thread.items[thread.rootId];
	if (!item || !item.id)
		return {
			ready: false,
			className: 'Item Item--loading',
			title: NO_TITLE,
			meta: NO_META,
			newCount: 0,
			lastVisitIso: '',
			lastVisitTitle: '',
			lastVisitText: '',
			sliderStyle: '',
			sliderMax: 0,
			sliderValue: 0,
			highlightText: '',
			highlightIso: '',
			highlightTitle: '',
			highlightAgo: '',
			html: '',
			poll: false,
			hasKids: false,
		};
	const { commentCount, newCommentCount } = stats(thread);
	const after = showAfter || commentCount - 1;
	const howMany = commentCount - after;
	const timeComment = commentByTimeIndex(thread, after + 1);
	const visitMs = thread.visit.lastVisit ?? 0;
	return {
		ready: true,
		className: item.dead ? 'Item Item--dead' : 'Item',
		title: title(item, thread.settings),
		meta: meta(item, now),
		newCount: thread.visit.lastVisit !== null ? newCommentCount : 0,
		lastVisitIso: isoTime(visitMs),
		lastVisitTitle: timeTitle(visitMs),
		lastVisitText: timeUnitsAgo(visitMs, now),
		sliderStyle: `margin-top: 1em; opacity: ${!loading && commentCount > 1 ? 1 : 0}; transition: opacity 0.33s ease-out;`,
		sliderMax: commentCount - 1,
		sliderValue: after,
		highlightText: `highlight ${howMany} comment${pluralise(howMany)} from `,
		highlightIso: timeComment ? isoTime((timeComment.time ?? 0) * 1000) : '',
		highlightTitle: timeComment ? timeTitle((timeComment.time ?? 0) * 1000) : '',
		highlightAgo: timeComment ? timeAgo((timeComment.time ?? 0) * 1000, now) : '',
		html: item.text ?? '',
		poll: item.type === 'poll',
		hasKids: Boolean(item.kids),
	};
}

export interface PollRow {
	readonly key: number;
	readonly loading: boolean;
	readonly text: string;
	readonly score: string;
}

export function pollRows(thread: Thread): PollRow[] {
	const item = thread.items[thread.rootId];
	if (item?.type !== 'poll') return [];
	return (item.parts ?? []).map((id) => {
		const part = thread.items[id];
		return part && part.id
			? {
					key: id,
					loading: false,
					text: part.text ?? '',
					score: `${part.score} point${pluralise(part.score)}`,
				}
			: { key: id, loading: true, text: '', score: '' };
	});
}

export function threadRows(thread: Thread, now: number): CommentRow[] {
	return commentRows(thread, now);
}

export interface UserView {
	readonly ready: boolean;
	readonly id: string;
	readonly createdIso: string;
	readonly createdTitle: string;
	readonly createdText: string;
	readonly createdDate: string;
	readonly karma: string;
	readonly delay: string;
	readonly about: string;
}

export function userView(user: User | null, id: string, now: number): UserView {
	if (!user?.id)
		return {
			ready: false,
			id,
			createdIso: '',
			createdTitle: '',
			createdText: '',
			createdDate: '',
			karma: '',
			delay: '',
			about: '',
		};
	const ms = user.created * 1000;
	return {
		ready: true,
		id: user.id,
		createdIso: isoTime(ms),
		createdTitle: timeTitle(ms),
		createdText: timeAgo(ms, now),
		createdDate: new Date(ms).toDateString(),
		karma: String(user.karma),
		delay: user.delay === undefined ? '' : String(user.delay),
		about: user.about ?? '',
	};
}

export { isNew, type CommentRow, type Flags };

export interface UpdateRow {
	readonly key: number;
	readonly className: string;
	readonly by: string;
	readonly userHref: string;
	readonly timeIso: string;
	readonly timeTitle: string;
	readonly timeText: string;
	readonly linkHref: string;
	readonly parentHref: string;
	readonly opHref: string;
	readonly opTitle: string;
	readonly deadText: string;
	readonly html: string;
}

export interface UpdatesPage {
	readonly ready: boolean;
	readonly rows: UpdateRow[];
	readonly page: number;
	readonly hasNext: boolean;
	readonly prevHref: string;
	readonly nextHref: string;
}

/** The old Updates page for comments: newest first, a page at a time, each with its parent and story once known. */
export function updatesPage(view: UpdatesView, page: number, now: number): UpdatesPage {
	const calc = pageCalc(page, ITEMS_PER_PAGE, view.comments.length);
	const rows = view.comments
		.slice(calc.startIndex, calc.endIndex)
		.filter((c) => !c.deleted)
		.map((comment): UpdateRow => {
			const ms = (comment.time ?? 0) * 1000;
			const found = view.ancestry[comment.id];
			const op = found?.op;
			const parent = found?.parent;
			return {
				key: comment.id,
				className: comment.dead
					? 'Comment Comment--level0 Comment--dead'
					: 'Comment Comment--level0',
				by: comment.by ?? '',
				userHref: `/user/${comment.by}`,
				timeIso: isoTime(ms),
				timeTitle: timeTitle(ms),
				timeText: timeAgo(ms, now),
				linkHref: `/comment/${comment.id}`,
				parentHref:
					parent && op && comment.parent !== op.id
						? `/${parent.type}/${comment.parent}`
						: '',
				opHref: op ? `/${op.type}/${op.id}` : '',
				opTitle: op?.title ?? '',
				deadText: comment.dead ? ' | [dead]' : '',
				html: comment.text ?? '',
			};
		});
	return {
		ready: view.comments.length > 0,
		rows,
		page: calc.pageNum,
		hasNext: calc.hasNext,
		prevHref: `/newcomments?page=${calc.pageNum - 1}`,
		nextHref: `/newcomments?page=${calc.pageNum + 1}`,
	};
}

export interface Permalink {
	readonly kind: 'loading' | 'error' | 'deleted' | 'comment';
	readonly className: string;
	readonly by: string;
	readonly userHref: string;
	readonly timeIso: string;
	readonly timeTitle: string;
	readonly timeText: string;
	readonly parentHref: string;
	readonly opHref: string;
	readonly opTitle: string;
	readonly deadText: string;
	readonly html: string;
	readonly showText: boolean;
	readonly replyLink: boolean;
	readonly replyHref: string;
	readonly hnHref: string;
	readonly hasKids: boolean;
}

/** The old PermalinkedComment: the comment with its parent and story links, then its replies, all at level 0 and below. */
export function permalink(
	state: PermalinkState,
	id: number,
	collapsed: Flags,
	now: number,
): { head: Permalink; rows: CommentRow[] } {
	const comment = state.items[id];
	const base = {
		by: '',
		userHref: '',
		timeIso: '',
		timeTitle: '',
		timeText: '',
		parentHref: '',
		opHref: '',
		opTitle: '',
		deadText: '',
		html: '',
		showText: false,
		replyLink: false,
		replyHref: '',
		hnHref: `https://news.ycombinator.com/item?id=${id}`,
		hasKids: false,
	};
	if (comment === null)
		return {
			head: { ...base, kind: 'error', className: 'Comment Comment--level0 Comment--error' },
			rows: [],
		};
	if (!comment || !comment.id)
		return {
			head: {
				...base,
				kind: 'loading',
				className: 'Comment Comment--loading Comment--level0',
			},
			rows: [],
		};
	if (comment.deleted)
		return {
			head: {
				...base,
				kind: 'deleted',
				className: 'Comment Comment--level0 Comment--deleted',
			},
			rows: [],
		};
	const ms = (comment.time ?? 0) * 1000;
	const { parent, op } = state.ancestry;
	const thread: Thread = {
		rootId: id,
		items: state.items,
		visit: { lastVisit: null, prevMaxCommentId: 0, firstVisit: false },
		settings: state.settings,
		highlighted: {},
		collapsed,
	};
	return {
		head: {
			...base,
			kind: 'comment',
			className: comment.dead
				? 'PermalinkedComment Comment Comment--level0 Comment--dead'
				: 'PermalinkedComment Comment Comment--level0',
			by: comment.by ?? '',
			userHref: `/user/${comment.by}`,
			timeIso: isoTime(ms),
			timeTitle: timeTitle(ms),
			timeText: timeAgo(ms, now),
			parentHref:
				parent && op && comment.parent !== op.id ? `/${parent.type}/${comment.parent}` : '',
			opHref: op ? `/${op.type}/${op.id}` : '',
			opTitle: op?.title ?? '',
			deadText: comment.dead ? ' | [dead]' : '',
			html: comment.text ?? '',
			showText: !comment.dead || state.settings.showDead,
			replyLink: state.settings.replyLinks && !comment.dead,
			replyHref: `https://news.ycombinator.com/reply?id=${id}`,
			hasKids: Boolean(comment.kids),
		},
		rows: commentRows(thread, now),
	};
}
