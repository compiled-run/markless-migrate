import { computed } from '@markless/core';

export default function HeaderNav({ currentUrl, isNavVisible, title }: { currentUrl: string; isNavVisible: boolean; title: string }) @{
	const sel = computed(() => ({
		newest: currentUrl === '/newest' ? 'topsel' : '',
		newcomments: currentUrl === '/newcomments' ? 'topsel' : '',
		show: currentUrl === '/show' ? 'topsel' : '',
		ask: currentUrl === '/ask' ? 'topsel' : '',
		jobs: currentUrl === '/jobs' ? 'topsel' : '',
		submit: currentUrl === '/submit' ? 'topsel' : '',
		best: currentUrl === '/best',
	}));
	@if (isNavVisible) {
		<span class="pagetop">
			<b class="hnname">
				<a href="/news">{title}</a>
			</b>
			{' '}
			<a class={sel.newest} href="/newest">new</a>
			{' | '}
			<a class={sel.newcomments} href="/newcomments">comments</a>
			{' | '}
			<a class={sel.show} href="/show">show</a>
			{' | '}
			<a class={sel.ask} href="/ask">ask</a>
			{' | '}
			<a class={sel.jobs} href="/jobs">jobs</a>
			{' | '}
			<a class={sel.submit} href="/submit">submit</a>
			@if (sel.best) {
				<>
					{' | '}
					<a class="topsel" href="/best">best</a>
				</>
			}
		</span>
	} @else {
		<span class="pagetop">
			<b>{title}</b>
		</span>
	}
}
