import { graphql } from './graphql.ts';
import { parseHtml, type Block } from './html.ts';
import { NEWS_ITEM_WITH_COMMENTS_QUERY } from './queries.ts';
import { convertNumberToTimeAgo } from './time-ago.ts';

interface CommentNode {
	readonly id: number;
	readonly creationTime: number;
	readonly submitterId: string;
	readonly text: string | null;
	readonly comments?: readonly CommentNode[];
}

interface NewsItem {
	readonly id: number;
	readonly title: string;
	readonly url?: string | null;
	readonly upvoted: boolean;
	readonly commentCount: number;
	readonly creationTime: number;
	readonly hidden: boolean;
	readonly submitterId: string;
	readonly upvoteCount: number;
	readonly comments: readonly CommentNode[] | null;
}

export interface CommentRow {
	readonly key: string;
	readonly width: string;
	readonly submitterId: string;
	readonly ago: string;
	readonly itemHref: string;
	readonly replyHref: string;
	readonly blocks: readonly Block[];
}

export interface ItemView {
	readonly head: ItemHead;
	readonly comments: readonly CommentRow[];
}

export function itemId(search: string): number {
	return Number(new URLSearchParams(search).get('id')) || 0;
}

const MAX_INDENT = 5;

// Comments.render(): the tree drawn as one flat table, six levels deep, each level 40 px further in.
function flatten(nodes: readonly CommentNode[], indent: number, rows: CommentRow[]): void {
	for (const comment of nodes) {
		rows.push({
			key: `${rows.length}`,
			width: `${indent * 40}`,
			submitterId: comment.submitterId,
			ago: convertNumberToTimeAgo(comment.creationTime),
			itemHref: `/item?id=${comment.id}`,
			replyHref: `/reply?id=${comment.id}&goto=item%3Fid%3D${comment.id}`,
			blocks: parseHtml(comment.text),
		});
		if (indent < MAX_INDENT) flatten(comment.comments ?? [], indent + 1, rows);
	}
}

export async function loadItem(search: string, _version: number): Promise<ItemView> {
	const result = await graphql<{ newsItem: NewsItem | null }>(NEWS_ITEM_WITH_COMMENTS_QUERY, {
		id: itemId(search),
	});
	const item = result.data?.newsItem;
	// The old page shows its spinner, and nothing else, until the item and its comments are there: the page's @catch.
	if (!item || !item.comments) throw new Error('No such item.');
	const comments: CommentRow[] = [];
	flatten(item.comments, 0, comments);
	return { head: itemHead(item), comments };
}

export interface ItemHead {
	readonly id: number;
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
	readonly hidden: boolean;
	/** 'unhide' once hidden: its handler did nothing in the old app. */
	readonly hideLabel: string;
}

const hostname = (url: string): string => {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
};

function itemHead(merged: NewsItem): ItemHead {
	const host = merged.url ? hostname(merged.url) : '';
	const n = merged.commentCount;
	return {
		id: merged.id,
		title: merged.title,
		href: merged.url || `item?id=${merged.id}`,
		host,
		siteHref: `from?site=${host}`,
		voteClass: merged.upvoted ? 'nosee' : ' ',
		score: `${merged.upvoteCount} points`,
		submitterId: merged.submitterId,
		userHref: `/user?id=${merged.submitterId}`,
		itemHref: `/item?id=${merged.id}`,
		ago: convertNumberToTimeAgo(merged.creationTime),
		comments: n === 0 ? 'discuss' : n === 1 ? '1 comment' : `${n} comments`,
		hidden: !!merged.hidden,
		hideLabel: merged.hidden ? 'unhide' : 'hide',
	};
}
