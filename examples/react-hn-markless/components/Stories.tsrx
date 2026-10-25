import { computed, state } from '@markless/core';
import { DEFAULT_SETTINGS, pageNumber } from '../lib/hn.ts';
import { followStories, type StoriesView } from '../lib/live.ts';
import { tick } from '../lib/clock.ts';
import { storiesPage } from '../lib/views.ts';

export default function Stories({ type, limit, title, route, search }: { type: string; limit: number; title: string; route: string; search: string }) @{
	let config = state({ type, limit, title, route, page: pageNumber(search) });
	let view = state<StoriesView>({ ids: type === 'read' ? null : [], items: {}, visits: {}, settings: DEFAULT_SETTINGS, limit });
	let now = state(Date.now());
	const shown = computed(() => storiesPage(view, config.type, config.route, config.page, now));

	<div
		class="Items"
		attach={() => {
			now = Date.now();
			const stop = followStories(config.type, config.page, config.limit, config.title || undefined, (next) => (view = next));
			const stopClock = tick(() => (now = Date.now()), () => Object.values(view.items).map((item) => (item?.time ?? 0) * 1000));
			return () => {
				stop();
				stopClock();
			};
		}}
		onVisible={() => {}}
	>
		<p hidden={!shown.empty}>There are no previously read stories to display.</p>
		<ol class="Items__list" start={shown.start} hidden={shown.empty || shown.blank}>
			@for (const row of shown.rows; key row.key) {
				<li class={row.className} style={row.spacing}>
					<div class="Spinner" style="width: 24px;" hidden={!row.loading}>
						<div class="bounce1" style="height: 6px; width: 6px; margin-right: 2px;"></div>
						<div class="bounce2" style="height: 6px; width: 6px; margin-right: 2px;"></div>
						<div class="bounce3" style="height: 6px; width: 6px; margin-right: 2px;"></div>
					</div>
					<div class="Item__title" style={row.title.style} hidden={row.loading}>
						<a href={row.title.href} hidden={row.title.dead}>{row.title.linkText}</a>{row.title.deadText}<span hidden={!row.title.external}> <span class="Item__host">({row.title.host})</span></span>
					</div>
					<div class="Item__meta" hidden={row.loading}>
						<span hidden={row.meta.job}><span class="Item__score">{row.meta.score}</span> <span class="Item__by">by <a href={row.meta.userHref}>{row.meta.by}</a></span> </span>
						<time class="Item__time" datetime={row.meta.timeIso} title={row.meta.timeTitle}>{row.meta.timeText}</time>
						<span hidden={row.meta.job}>{' | '}<a href={row.meta.itemHref}>{row.meta.comments}</a><span class="ListItem__newcomments" hidden={row.newComments <= 0}> (<a href={row.meta.itemHref}>{row.newComments} new</a>)</span></span>
					</div>
				</li>
			}
		</ol>
		<div class="Paginator" hidden={shown.empty || shown.blank || !(shown.page > 1 || shown.hasNext)}>
			<span class="Paginator__prev" hidden={shown.page <= 1}><a href={shown.prevHref}>Prev</a></span>
			<span hidden={!(shown.page > 1 && shown.hasNext)}>{' | '}</span>
			<span class="Paginator__next" hidden={!shown.hasNext}><a href={shown.nextHref}>More</a></span>
		</div>
	</div>
}
