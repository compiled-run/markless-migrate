import { computed, state } from '@markless/core';
import { tick } from '../lib/clock.ts';
import { DEFAULT_SETTINGS } from '../lib/hn.ts';
import { followThread, markRead, type ThreadState } from '../lib/live.ts';
import { showMarkup } from '../lib/markup.ts';
import { collapseWithoutNew, highlightSince, shownTimes, toggled, type Flags, type Thread } from '../lib/thread.ts';
import { itemHeader, pollRows, threadRows } from '../lib/views.ts';
import CommentList from './CommentList.tsrx';

export default function ItemView({ id, path }: { id: string; path: string }) @{
	let rootId = state(Number(id));
	let here = state(path);
	let live = state<ThreadState>({ items: {}, visit: { lastVisit: null, prevMaxCommentId: 0, firstVisit: true }, settings: DEFAULT_SETTINGS, loading: true, delayed: {} });
	let collapsed = state<Flags>({});
	let highlighted = state<Flags | null>(null);
	let showAfter = state(0);
	let now = state(Date.now());
	const thread = computed<Thread>(() => ({ rootId, items: live.items, visit: live.visit, settings: live.settings, highlighted, collapsed, delayed: live.delayed }));
	const header = computed(() => itemHeader(thread, live.loading, showAfter, now));
	const rows = computed(() => threadRows(thread, now));
	const polls = computed(() => pollRows(thread));
	const linksHere = computed(() => header.meta.itemHref === here);
	const titleHere = computed(() => header.title.href === here);

	<div
		class={header.className}
		attach={(element) => {
			now = Date.now();
			const stopMarkup = showMarkup(element);
			const stop = followThread(rootId, (next) => (live = next), (flags) => (collapsed = flags));
			const stopClock = tick(() => (now = Date.now()), () => shownTimes(thread));
			return () => {
				stop();
				stopClock();
				stopMarkup();
			};
		}}
		onVisible={() => {}}
	>
		<div class="Spinner" style="width: 66px;" hidden={header.ready}>
			<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
		</div>
		<div class="Item__content" hidden={!header.ready}>
			<div class="Item__title" style={header.title.style}>
				<a href={header.title.href} hidden={header.title.dead} onClick={(event) => { if (titleHere) event.preventDefault(); }}>{header.title.linkText}</a>{header.title.deadText}<span hidden={!header.title.external}> <span class="Item__host">({header.title.host})</span></span>
			</div>
			<div class="Item__meta">
				<span hidden={header.meta.job}><span class="Item__score">{header.meta.scoreValue} point{header.meta.scorePlural}</span> <span class="Item__by">by <a href={header.meta.userHref}>{header.meta.by}</a></span> </span>
				<time class="Item__time" datetime={header.meta.timeIso} title={header.meta.timeTitle}>{header.meta.timeText}</time>
				<span hidden={header.meta.job}>
					{' | '}
					<a
						href={header.meta.itemHref}
						onClick={(event) => {
							// hashHistory does not push the path it is already on, so the old link to this page does nothing.
							if (linksHere) event.preventDefault();
						}}
					>
						{header.meta.comments}
					</a>
					<span hidden={header.newCount <= 0}>
						{' '}(<em>{header.newCount} new</em> in the last <time datetime={header.lastVisitIso} title={header.lastVisitTitle}>{header.lastVisitText}</time>{') | '}
						<span
							class="control"
							tabindex="0"
							title="Collapse threads without new comments"
							onClick={(event) => {
								event.preventDefault();
								collapsed = collapseWithoutNew(thread);
							}}
							onKeyPress={(event) => {
								event.preventDefault();
								collapsed = collapseWithoutNew(thread);
							}}
						>
							auto collapse
						</span>
						{' | '}
						<span
							class="control"
							tabindex="0"
							onClick={(event) => {
								event.preventDefault();
								live = { ...live, visit: markRead(rootId, live) };
								highlighted = null;
							}}
							onKeyPress={(event) => {
								event.preventDefault();
								live = { ...live, visit: markRead(rootId, live) };
								highlighted = null;
							}}
						>
							mark as read
						</span>
					</span>
				</span>
			</div>
			<div style={header.sliderStyle}>
				<input type="range" max={header.sliderMax} min="1" style="margin: 0px; vertical-align: middle;" value={header.sliderValue} onInput={(event) => (showAfter = Number((event.target as HTMLInputElement).value))} />
				<button
					type="button"
					onClick={() => {
						highlighted = highlightSince(thread, header.sliderValue);
						collapsed = collapseWithoutNew({ ...thread, highlighted });
					}}
				>
					<span>{header.highlightText}<time datetime={header.highlightIso} title={header.highlightTitle} hidden={!header.highlightIso}>{header.highlightAgo}</time></span>
				</button>
			</div>
			<div class="Item__text" hidden={!header.html}>
				<div data-html={header.html}></div>
			</div>
			<div class="Item__poll" hidden={!header.poll}>
				@for (const poll of polls; key poll.key) {
					<div class={poll.loading ? 'PollOption PollOption--loading' : 'PollOption'}>
						<div class="Spinner" style="width: 66px;" hidden={!poll.loading}>
							<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
							<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
							<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
						</div>
						<div class="PollOption__text" hidden={poll.loading}>{poll.text}</div>
						<div class="PollOption__score" hidden={poll.loading}>{poll.score}</div>
					</div>
				}
			</div>
		</div>
		<div class="Item__kids" hidden={!header.hasKids}>
			<CommentList rows={rows} onToggle={(id) => (collapsed = toggled(collapsed, id))} />
		</div>
	</div>
}
