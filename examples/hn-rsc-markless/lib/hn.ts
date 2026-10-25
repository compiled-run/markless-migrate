import timeAgo from './time-ago.ts';
import type { Block } from './rich-text.ts';

const API = 'https://hacker-news.firebaseio.com/v0/';

export async function fetchData<T>(type: string): Promise<T> {
	const res = await fetch(`${API}${type}.json`);
	if (res.status !== 200) throw new Error(`Status ${res.status}`);
	return res.json() as Promise<T>;
}

export interface RawItem {
	readonly id: number;
	readonly by?: string;
	readonly time?: number;
	readonly url?: string;
	readonly title?: string;
	readonly text?: string;
	readonly score?: number;
	readonly kids?: readonly number[];
	readonly descendants?: number;
}

export interface StoryView {
	readonly id: number;
	readonly title: string;
	readonly url: string;
	readonly host: string;
	readonly hostLabel: string;
	readonly user: string;
	readonly score: string;
	readonly pointWord: string;
	readonly ago: string;
	readonly count: number;
	readonly commentWord: string;
	readonly kids: readonly number[];
}

const plural = (n: number | undefined, s: string) => s + (n === 0 || (n ?? 0) > 1 ? 's' : '');

export function storyView(val: RawItem): StoryView {
	const url = val.url || '';
	const host = url ? new URL(url).host : '#';
	const date = new Date((val.time ?? NaN) * 1000).getTime() || 0;
	const commentsCount = val.descendants || 0;
	return {
		id: val.id,
		title: val.title ?? '',
		url,
		host,
		hostLabel: host.replace(/^www\./, ''),
		user: val.by ?? '',
		score: `${val.score ?? ''}`,
		pointWord: plural(val.score, 'point'),
		ago: timeAgo(date),
		count: commentsCount,
		commentWord: plural(commentsCount, 'comment'),
		kids: val.kids || [],
	};
}

export async function topStories(page: string): Promise<{
	readonly offset: number;
	readonly stories: readonly StoryView[];
	readonly more: string;
}> {
	const limit = 30;
	const offset = (Number(page) - 1) * limit;
	const ids = await fetchData<number[]>('topstories');
	const stories = await Promise.all(
		ids
			.slice(offset, offset + limit)
			.map(async (id) => storyView(await fetchData<RawItem>(`item/${id}`))),
	);
	return { offset, stories, more: `/news/${+page + 1}` };
}

export interface CommentView {
	readonly id: number;
	readonly user: string;
	readonly ago: string;
	readonly text: readonly Block[];
	readonly collapsed: string;
	readonly comments: readonly CommentView[];
}

export async function commentTree(ids: readonly number[]): Promise<readonly CommentView[]> {
	// parse5 stays on the server: this runs only while the page renders there.
	const { richText } = import.meta.env.SSR
		? await import('./rich-text.ts')
		: { richText: () => [] };
	const load = (kids: readonly number[]): Promise<CommentView[]> =>
		Promise.all(
			kids.map(async (id) => {
				const val = await fetchData<RawItem>(`item/${id}`);
				return {
					id: val.id,
					user: val.by ?? '',
					ago: timeAgo(new Date((val.time ?? NaN) * 1000).getTime() || 0),
					text: richText(val.text),
					collapsed: `[+${(val.descendants || 0) + 1}]`,
					comments: await load(val.kids || []),
				};
			}),
		);
	return load(ids);
}

export async function itemWithComments(
	id: string,
): Promise<{ readonly story: StoryView; readonly comments: readonly CommentView[] }> {
	const story = storyView(await fetchData<RawItem>(`item/${id}`));
	return { story, comments: await commentTree(story.kids) };
}
