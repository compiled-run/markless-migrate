import { computed } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { cn } from '../../lib/utils.ts';

type DivProps = PropsOf<'div'> & { readonly class?: string; readonly children?: Children };

export function Card({ class: klass, children, ...rest }: DivProps) @{
	const cardClass = computed(() => cn('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', klass));
	<div data-slot="card" class={cardClass} {...rest}>{children}</div>
}

export function CardHeader({ class: klass, children, ...rest }: DivProps) @{
	const cardHeaderClass = computed(() => cn('@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6', klass));
	<div data-slot="card-header" class={cardHeaderClass} {...rest}>{children}</div>
}

export function CardTitle({ class: klass, children, ...rest }: DivProps) @{
	const cardTitleClass = computed(() => cn('leading-none font-semibold', klass));
	<div data-slot="card-title" class={cardTitleClass} {...rest}>{children}</div>
}

export function CardDescription({ class: klass, children, ...rest }: DivProps) @{
	const cardDescriptionClass = computed(() => cn('text-sm text-muted-foreground', klass));
	<div data-slot="card-description" class={cardDescriptionClass} {...rest}>{children}</div>
}

export function CardContent({ class: klass, children, ...rest }: DivProps) @{
	const cardContentClass = computed(() => cn('px-6', klass));
	<div data-slot="card-content" class={cardContentClass} {...rest}>{children}</div>
}

export function CardFooter({ class: klass, children, ...rest }: DivProps) @{
	const cardFooterClass = computed(() => cn('flex items-center px-6 [.border-t]:pt-6', klass));
	<div data-slot="card-footer" class={cardFooterClass} {...rest}>{children}</div>
}
