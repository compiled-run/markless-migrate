// The Markless port of @radix-ui/react-dialog 1.1.15, certified against it by
// test/e2e/radix-dialog-port.test.ts. The parts render Radix's markup and `data-state`; engine.ts does what Radix does
// to the page as each part comes and goes. What is covered is listed in support.ts.
import { element, shared, state } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import { installDialog } from './engine.ts';

// One instance per rendered dialog.
export const dialogState = shared(
	() => {
		const d = state({ open: false, controlled: false });
		// One dialog may have a trigger in each of several exclusive places (a header per layout); the one on the page restores focus.
		const triggerEl = element<HTMLButtonElement[]>();
		const overlayEl = element<HTMLDivElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		return {
			...d,
			triggerEl,
			overlayEl,
			contentEl,
			titleEl,
			descriptionEl,
			onOpenChange: undefined as ((open: boolean) => void) | undefined,
			setOpen(next: boolean) {
				if (d.open === next) return;
				if (d.controlled !== true) d.open = next;
				d.onOpenChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);


export type DialogRootProps = {
	/** Controlled open state; the dialog then opens and closes only when the page changes it. */
	readonly open?: boolean;
	readonly defaultOpen?: boolean;
	/** Called with the next state whenever a part asks to open or close (the trigger, a close, Escape, a press outside). */
	readonly onOpenChange?: (open: boolean) => void;
	readonly children?: Children;
};

export function DialogRoot({ open, defaultOpen = false, onOpenChange, children }: DialogRootProps) @{
	const d = dialogState();
	d.controlled = open !== undefined;
	d.open = open ?? defaultOpen;
	d.onOpenChange = onOpenChange;
	<>{children}</>
}


export function DialogTrigger({ children, onClick, ...rest }: PropsOf<'button'>) @{
	const d = dialogState();
	<button
		type="button"
		aria-haspopup="dialog"
		aria-expanded={d.open ? 'true' : 'false'}
		aria-controls={d.contentEl}
		data-state={d.open ? 'open' : 'closed'}
		{...rest}
		el={d.triggerEl}
		onClick={(event) => {
			onClick?.(event);
			if (event.defaultPrevented) return;
			installDialog(d.triggerEl, d.overlayEl, d.contentEl, undefined, false);
			d.setOpen(d.open !== true);
		}}
	>{children}</button>
}

/** Radix moves its children to the body; here engine.ts moves each part to the end of its Markless container as it opens. */
export function DialogPortal({ children }: { readonly children?: Children }) @{
	<>{children}</>
}

export function DialogOverlay({ children, ...rest }: PropsOf<'div'>) @{
	const d = dialogState();
	<div data-state={d.open ? 'open' : 'closed'} {...rest} el={d.overlayEl} style="pointer-events: auto;" hidden>{children}</div>
}

export function DialogContent({ children, ...rest }: PropsOf<'div'>) @{
	const d = dialogState();
	<div
		role="dialog"
		aria-describedby={d.descriptionEl}
		aria-labelledby={d.titleEl}
		data-state={d.open ? 'open' : 'closed'}
		{...rest}
		el={d.contentEl}
		tabindex={-1}
		style="pointer-events: auto;"
		hidden
		onIdle={() => {
			installDialog(d.triggerEl, d.overlayEl, d.contentEl, undefined, false);
		}}
		onRadixdismiss={() => {
			d.setOpen(false);
		}}
	>{children}</div>
}

export function DialogTitle({ children, ...rest }: PropsOf<'h2'>) @{
	const d = dialogState();
	<h2 {...rest} el={d.titleEl}>{children}</h2>
}

/** `asChild` over a <div> renders the description as that <div>. */
export function DialogDescription({ asChild, children, ...rest }: PropsOf<'p'> & { readonly asChild?: boolean }) @{
	const d = dialogState();
	const tag = asChild === true ? 'div' : 'p';
	<{tag} {...rest} el={d.descriptionEl}>{children}</{tag}>
}

export function DialogClose({ children, onClick, ...rest }: PropsOf<'button'>) @{
	const d = dialogState();
	<button
		type="button"
		{...rest}
		onClick={(event) => {
			onClick?.(event);
			if (event.defaultPrevented) return;
			d.setOpen(false);
		}}
	>{children}</button>
}
