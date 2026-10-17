import { computed } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { cn } from '../../lib/utils.ts';
import { badgeVariants, type BadgeVariant } from './variants.ts';

export function Badge({ variant, class: klass, children, ...rest }: PropsOf<'span'> & { readonly variant?: BadgeVariant; readonly class?: string; readonly children?: Children }) @{
	const cls = computed(() => cn(badgeVariants({ variant }), klass));
	<span data-slot="badge" class={cls} {...rest}>{children}</span>
}
