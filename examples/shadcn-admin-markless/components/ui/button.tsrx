import { computed } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { cn } from '../../lib/utils.ts';
import { buttonVariants, type ButtonSize, type ButtonVariant } from './variants.ts';

// disabled is its own prop: a value forwarded through {...rest} renders once and never updates (Markless 0.4.0).
export type ButtonProps = PropsOf<'button'> & {
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	readonly class?: string;
	readonly children?: Children;
};

export function Button({ variant, size, class: klass, disabled, children, ...rest }: ButtonProps) @{
	const buttonClass = computed(() => cn(buttonVariants({ variant, size, className: klass })));
	<button data-slot="button" class={buttonClass} {...rest} disabled={disabled}>{children}</button>
}

export type LinkButtonProps = PropsOf<'a'> & {
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	readonly class?: string;
	readonly children?: Children;
};

export function LinkButton({ variant, size, class: klass, children, ...rest }: LinkButtonProps) @{
	const linkClass = computed(() => cn(buttonVariants({ variant, size, className: klass })));
	<a data-slot="button" class={linkClass} {...rest}>{children}</a>
}
