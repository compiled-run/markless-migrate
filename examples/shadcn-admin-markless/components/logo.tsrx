import { computed } from '@markless/core';
import { cn } from '../lib/utils.ts';

export function Logo({ class: klass }: { readonly class?: string }) @{
	const cls = computed(() => cn('size-6', klass));
	<svg id="shadcn-admin-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={cls}><title>Shadcn-Admin</title><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></svg>
}
