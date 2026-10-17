import { computed } from '@markless/core';
import { cn } from '../../lib/utils.ts';

export function Separator({ class: klass, orientation }: { readonly class?: string; readonly orientation?: 'horizontal' | 'vertical' }) @{
	const cls = computed(() => cn('shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px', klass));
	const o = computed(() => orientation ?? 'horizontal');
	<div data-slot="separator" role="none" data-orientation={o} class={cls}></div>
}
