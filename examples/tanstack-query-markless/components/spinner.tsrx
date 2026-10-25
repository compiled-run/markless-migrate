import { computed } from '@markless/core';

export function Spinner({ show, wait }: { show?: boolean; wait?: `delay-${number}` }) @{
	const cls = computed(
		() =>
			`inline-block animate-spin px-3 transition ${(show ?? true) ? `opacity-100 duration-500 ${wait ?? 'delay-300'}` : 'duration-500 opacity-0 delay-0'}`,
	);

	<div class={cls}>{'⍥'}</div>
}
