import { computed, state } from '@markless/core';
import { tick } from '../lib/clock.ts';
import { DEFAULT_SETTINGS, pageNumber } from '../lib/hn.ts';
import { followUpdates, type UpdatesView } from '../lib/live.ts';
import { showMarkup } from '../lib/markup.ts';
import { updatesPage } from '../lib/views.ts';

export default function Updates({ search }: { search: string }) @{
	let page = state(pageNumber(search));
	let view = state<UpdatesView>({ comments: [], stories: [], settings: DEFAULT_SETTINGS, ancestry: {} });
	let now = state(Date.now());
	const shown = computed(() => updatesPage(view, page, now));

	<div
		class={shown.ready ? 'Updates Comments' : 'Updates Updates--loading'}
		attach={(element) => {
			now = Date.now();
			const stopMarkup = showMarkup(element);
			const stop = followUpdates(page, (next) => (view = next));
			const stopClock = tick(() => (now = Date.now()), () => view.comments.map((c) => (c.time ?? 0) * 1000));
			return () => {
				stop();
				stopClock();
				stopMarkup();
			};
		}}
		onVisible={() => {}}
	>
		<div class="Spinner" style="width: 66px;" hidden={shown.ready}>
			<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
			<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
		</div>
		<div hidden={!shown.ready}>
			@for (const row of shown.rows; key row.key) {
				<div class={row.className}>
					<div class="Comment__content">
						<div class="Comment__meta">
							<a href={row.userHref} class="Comment__user">{row.by}</a>{' '}
							<time datetime={row.timeIso} title={row.timeTitle}>{row.timeText}</time>
							{' | '}
							<a href={row.linkHref}>link</a>
							<span hidden={!row.parentHref}>{' | '}<a href={row.parentHref}>parent</a></span>
							<span hidden={!row.opHref}>{' | on: '}<a href={row.opHref}>{row.opTitle}</a></span>
							{row.deadText}
						</div>
						<div class="Comment__text">
							<div data-html={row.html}></div>
						</div>
					</div>
				</div>
			}
		</div>
		<div class="Paginator" hidden={!shown.ready || !(shown.page > 1 || shown.hasNext)}>
			<span class="Paginator__prev" hidden={shown.page <= 1}><a href={shown.prevHref}>Prev</a></span>
			<span hidden={!(shown.page > 1 && shown.hasNext)}>{' | '}</span>
			<span class="Paginator__next" hidden={!shown.hasNext}><a href={shown.nextHref}>More</a></span>
		</div>
	</div>
}
