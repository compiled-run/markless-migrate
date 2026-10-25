import { computed, state } from '@markless/core';
import { navigate } from '@markless/router';
import { tick } from '../lib/clock.ts';
import { DEFAULT_SETTINGS } from '../lib/hn.ts';
import { followPermalink, type PermalinkState } from '../lib/live.ts';
import { showMarkup } from '../lib/markup.ts';
import { toggled, type Flags } from '../lib/thread.ts';
import { permalink } from '../lib/views.ts';
import CommentList from './CommentList.tsrx';

export default function Permalinked({ id }: { id: string }) @{
	let commentId = state(Number(id));
	let live = state<PermalinkState>({ items: {}, ancestry: { parent: null, op: null }, settings: DEFAULT_SETTINGS });
	let collapsed = state<Flags>({});
	let now = state(Date.now());
	const view = computed(() => permalink(live, commentId, collapsed, now));
	const rows = computed(() => view.rows);

	<div
		class={view.head.className}
		attach={(element) => {
			now = Date.now();
			const stopMarkup = showMarkup(element);
			const stop = followPermalink(commentId, (next) => (live = next), (path) => navigate(path, { replace: true }));
			const stopClock = tick(() => (now = Date.now()), () => Object.values(live.items).map((item) => (item?.time ?? 0) * 1000));
			return () => {
				stop();
				stopClock();
				stopMarkup();
			};
		}}
		onVisible={() => {}}
	>
		<div class="Spinner" style="width: 66px;" hidden={view.head.kind !== 'loading'}>
			<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
		</div>
		<div class="Comment__content" hidden={view.head.kind === 'loading'}>
			<div class="Comment__meta">
				<span hidden={view.head.kind !== 'comment'}>
					<a href={view.head.userHref} class="Comment__user">{view.head.by}</a>{' '}
					<time datetime={view.head.timeIso} title={view.head.timeTitle}>{view.head.timeText}</time>
					<span hidden={!view.head.parentHref}>{' | '}<a href={view.head.parentHref}>parent</a></span>
					<span hidden={!view.head.opHref}>{' | on: '}<a href={view.head.opHref}>{view.head.opTitle}</a></span>
					{view.head.deadText}
				</span>
				<span hidden={view.head.kind !== 'deleted'}>[deleted] | <a href={view.head.hnHref}>view on Hacker News</a></span>
			</div>
			<div class="Comment__text" hidden={!view.head.showText}>
				<div data-html={view.head.html}></div>
				<p hidden={!view.head.replyLink}><a href={view.head.replyHref}>reply</a></p>
			</div>
		</div>
		<div class="Comment__kids" hidden={!view.head.hasKids}>
			<CommentList rows={rows} onToggle={(at) => (collapsed = toggled(collapsed, at))} />
		</div>
	</div>
}
