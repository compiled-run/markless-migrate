import { navigate } from '@markless/router';
import { graphql } from './graphql.ts';
import type { NewsItemModel } from './models.ts';
import { feedQuery, HIDE_NEWS_ITEM_MUTATION, UPVOTE_NEWS_ITEM_MUTATION } from './queries.ts';
import { convertNumberToTimeAgo } from './time-ago.ts';

export const POSTS_PER_PAGE = 30;

export type FeedType = 'top' | 'new' | 'best' | 'show' | 'ask' | 'job';

type FeedItem = Pick<
	NewsItemModel,
	| 'id'
	| 'title'
	| 'url'
	| 'upvoted'
	| 'commentCount'
	| 'creationTime'
	| 'hidden'
	| 'submitterId'
	| 'upvoteCount'
>;

export interface Feed {
	readonly rows: readonly FeedRow[];
	readonly more: string;
}

export interface FeedRow {
	readonly id: number;
	readonly rank: string;
	readonly title: string;
	readonly href: string;
	readonly host: string;
	readonly siteHref: string;
	readonly voteClass: string;
	readonly score: string;
	readonly submitterId: string;
	readonly userHref: string;
	readonly itemHref: string;
	readonly ago: string;
	readonly comments: string;
}

export function pageNumber(search: string): number {
	return Number(new URLSearchParams(search).get('p')) || 0;
}

// `_version` is read so a mutation can ask for the feed again: Apollo merged mutation answers into its cache instead.
export async function loadFeed(
	operation: string,
	type: FeedType,
	search: string,
	currentUrl: string,
	_version: number,
): Promise<Feed> {
	const skip = POSTS_PER_PAGE * pageNumber(search);
	const result = await graphql<{ feed: FeedItem[] | null }>(feedQuery(operation), {
		type,
		first: POSTS_PER_PAGE,
		skip,
	});
	const items = (result.data?.feed ?? []).filter((item): item is FeedItem => !!item);
	// Without a non-empty feed (an error included) the old page shows its spinner: the page's @catch. An @if around the rows instead loses their handlers once the feed is fetched again (repros/rows-in-branch-lose-handlers).
	if (!items.length) throw new Error(result.errors?.[0]?.message ?? 'Empty feed.');
	return { rows: feedRows(items, skip), more: moreHref(currentUrl, skip, POSTS_PER_PAGE) };
}

export function sampleFeed(items: readonly FeedItem[], search: string, currentUrl: string): Feed {
	const skip = pageNumber(search) * 30;
	return { rows: feedRows(items, skip), more: moreHref(currentUrl, skip, 30) };
}

const hostname = (url: string): string => {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
};

const commentsLabel = (n: number): string =>
	n === 0 ? 'discuss' : n === 1 ? '1 comment' : `${n} comments`;

export function feedRows(items: readonly FeedItem[], skip: number): FeedRow[] {
	return items
		.filter((item) => !item.hidden)
		.map((item, index) => {
			const host = item.url ? hostname(item.url) : '';
			return {
				id: item.id,
				rank: `${skip + index + 1}.`,
				title: item.title,
				href: item.url || `item?id=${item.id}`,
				host,
				siteHref: `from?site=${host}`,
				voteClass: item.upvoted ? 'nosee' : ' ',
				score: `${item.upvoteCount} points`,
				submitterId: item.submitterId,
				userHref: `/user?id=${item.submitterId}`,
				itemHref: `/item?id=${item.id}`,
				ago: convertNumberToTimeAgo(item.creationTime),
				comments: commentsLabel(item.commentCount),
			};
		});
}

export function moreHref(currentUrl: string, skip: number, first: number): string {
	return `${currentUrl}?p=${Math.ceil((skip || 1) / first) + 1}`;
}

/** Runs the mutation; answers the address the old app's onError sent the visitor to, if it failed. */
export async function upvote(id: number): Promise<string | undefined> {
	const result = await graphql(UPVOTE_NEWS_ITEM_MUTATION, { id });
	return result.errors?.length ? `/vote?id=${id}&how=up&goto=news` : undefined;
}

export async function hide(id: number): Promise<string | undefined> {
	const result = await graphql(HIDE_NEWS_ITEM_MUTATION, { id });
	return result.errors?.length ? `/hide?id=${id}&how=up&goto=news` : undefined;
}

// Next's Router.push(href, as): the login page, shown under another address.
export async function pushLogin(as: string): Promise<void> {
	await navigate('/login');
	history.replaceState(history.state, '', as);
}

/** What a click inside the feed's table asks for, and the story it is on: the story's id is in its item link. */
export function feedAction(
	target: EventTarget | null,
): { kind: 'upvote' | 'hide'; id: number } | undefined {
	const element = target instanceof Element ? target : null;
	const link = element?.closest('a');
	const row = link?.closest('tr');
	if (!link || !row) return undefined;
	const kind = link.closest('.votelinks')
		? 'upvote'
		: link.textContent?.trim() === 'hide'
			? 'hide'
			: undefined;
	const subtext = kind === 'upvote' ? row.nextElementSibling : row;
	const id = Number(
		new URL(
			subtext?.querySelector('.age a')?.getAttribute('href') ?? '',
			'http://x',
		).searchParams.get('id'),
	);
	return kind && id ? { kind, id } : undefined;
}
