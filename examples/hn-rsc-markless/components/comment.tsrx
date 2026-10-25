import { state } from '@markless/core';
import type { CommentView } from '../lib/hn.ts';
import type { Block } from '../lib/rich-text.ts';

export default function Comment({ user, ago, text, collapsed, comments }: {
	readonly user: string;
	readonly ago: string;
	readonly text: readonly Block[];
	readonly collapsed: string;
	readonly comments: readonly CommentView[];
}) @{
	let toggled = state(false);
	<div class="comment">
		<div class="meta">
			{user} {ago} ago{' '}
			<span onClick={() => (toggled = !toggled)} class="toggle">{toggled ? collapsed : '[-]'}</span>
		</div>
		<div class="text" hidden={toggled}>
			@for (const block of text; key block.id) {
				@if (block.kind === 'p') {
					<p>
						@for (const run of block.runs; key run.id) {
								@if (run.kind === 'a') {
									<a href={run.href} rel={run.rel}>{run.text}</a>
								} @else if (run.kind === 'i') {
									<i>{run.text}</i>
								} @else if (run.kind === 'code') {
									<code>{run.text}</code>
								} @else {
									<>{run.text}</>
								}
							}
					</p>
				} @else if (block.kind === 'pre') {
					<pre>
						@for (const run of block.runs; key run.id) {
								@if (run.kind === 'a') {
									<a href={run.href} rel={run.rel}>{run.text}</a>
								} @else if (run.kind === 'i') {
									<i>{run.text}</i>
								} @else if (run.kind === 'code') {
									<code>{run.text}</code>
								} @else {
									<>{run.text}</>
								}
							}
					</pre>
				} @else {
					<>
						@for (const run of block.runs; key run.id) {
								@if (run.kind === 'a') {
									<a href={run.href} rel={run.rel}>{run.text}</a>
								} @else if (run.kind === 'i') {
									<i>{run.text}</i>
								} @else if (run.kind === 'code') {
									<code>{run.text}</code>
								} @else {
									<>{run.text}</>
								}
							}
					</>
				}
			}
		</div>
		<div class="children" hidden={toggled}>
			@for (const comment of comments; key comment.id) {
				<Comment user={comment.user} ago={comment.ago} text={comment.text} collapsed={comment.collapsed} comments={comment.comments} />
			}
		</div>
		<style>
			.comment {
				margin-bottom: 15px;
			}
			.children {
				padding-left: 20px;
			}
			.meta {
				font-size: 12px;
				margin-bottom: 5px;
			}
			.toggle {
				cursor: pointer;
			}
			.text {
				color: #000;
				font-size: 13px;
				line-height: 18px;
			}
			.text p {
				margin-top: 10px;
			}
			.text pre {
				margin-bottom: 10px;
				max-width: 900px;
				overflow: auto;
				padding: 2px;
				white-space: pre-wrap;
			}
			.text a {
				color: #000;
			}
		</style>
	</div>
}
