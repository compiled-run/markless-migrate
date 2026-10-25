import { state } from '@markless/core';

export default function Story({ id, title, url, host, hostLabel, user, score, pointWord, ago, count, commentWord }: {
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
}) @{
	let voted = state(false);
	const href = `/item/${id}`;
	// An @if here breaks resume of a later boundary's rows (repros/pages/two-boundaries.tsrx).
	<div class="story">
		<div class="title">
			<span class={voted ? 'votearrow votearrow--voted' : 'votearrow'} onClick={() => (voted = !voted)}>▲</span>
			<a href={url} rel="noopener noreferrer nofollow" target="_blank">{title}</a>
			<span class="source" hidden={!url}>
				{' ('}
				<a href={`http://${host}`} rel="noopener noreferrer nofollow" target="_blank">{hostLabel}</a>
				{')'}
			</span>
		</div>
		<div class="meta">
			{score} {pointWord} by{' '}
			<span>{user}</span>{' '}
			<a href={href}>
				<span>{ago} ago</span>
			</a>{' '}
			|{' '}
			<a href={href}>
				{count} {commentWord}
			</a>
		</div>
		<style>
			.story {
				flex: 100 1;
				display: inline-block;
			}
			.title {
				font-size: 15px;
				margin-bottom: 1px;
			}
			.votearrow {
				cursor: pointer;
				font-family: sans-serif;
				color: #ccc;
				font-size: 12px;
				margin-right: 2px;
			}
			.votearrow--voted {
				color: #ffa52a;
			}
			.title > a {
				color: #000;
				text-decoration: none;
			}
			.title > a:visited {
				color: #757575;
			}
			.meta {
				font-size: 12px;
			}
			.source {
				font-size: 12px;
				display: inline-block;
				margin-left: 5px;
			}
			.source a,
			.meta a {
				color: #757575;
				text-decoration: none;
			}
			.source a:hover,
			.meta a:hover {
				text-decoration: underline;
			}
		</style>
	</div>
}
