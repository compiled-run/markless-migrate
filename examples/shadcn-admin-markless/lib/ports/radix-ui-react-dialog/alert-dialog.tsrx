// markless-migrate certified port radix-ui-react-dialog/alert-dialog.tsrx, copied by markless-migrate parity; do not edit. sha256:1a954f84d0fd8e8e73be8a8041b513193711d7ace4a6fffa673d7fdb619244c6
// The Markless port of @radix-ui/react-alert-dialog 1.1.15: the dialog parts with Cancel, which takes the opening focus,
// and no closing on a press outside. Its own module because a part binds its definition's handles, a handle is bound
// by one part, and a second definition in one module mints no ids for its handles.
import { element, shared, state } from '@markless/core';
import type { Children, PropsOf } from '@markless/core';
import type { DialogRootProps } from './dialog.tsrx';
import { installDialog } from './engine.ts';

export const alertDialogState = shared(
	() => {
		const d = state({ open: false, controlled: false });
		// One dialog may have a trigger in each of several exclusive places (a header per layout); the one on the page restores focus.
		const triggerEl = element<HTMLButtonElement[]>();
		const overlayEl = element<HTMLDivElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		const cancelEl = element<HTMLButtonElement>();
		return {
			...d,
			triggerEl,
			overlayEl,
			contentEl,
			titleEl,
			descriptionEl,
			cancelEl,
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

export function AlertDialogRoot({ open, defaultOpen = false, onOpenChange, children }: DialogRootProps) @{
	const d = alertDialogState();
	d.controlled = open !== undefined;
	d.open = open ?? defaultOpen;
	d.onOpenChange = onOpenChange;
	<>{children}</>
}

/** AlertDialog.Cancel: a close the dialog focuses as it opens. */
export function AlertDialogCancel({ children, onClick, ...rest }: PropsOf<'button'>) @{
	const d = alertDialogState();
	<button
		type="button"
		{...rest}
		el={d.cancelEl}
		onClick={(event) => {
			onClick?.(event);
			if (event.defaultPrevented) return;
			d.setOpen(false);
		}}
	>{children}</button>
}

export function AlertDialogTrigger({ children, onClick, ...rest }: PropsOf<'button'>) @{
	const d = alertDialogState();
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
			installDialog(d.triggerEl, d.overlayEl, d.contentEl, d.cancelEl, true);
			d.setOpen(d.open !== true);
		}}
	>{children}</button>
}

export function AlertDialogPortal({ children }: { readonly children?: Children }) @{
	<>{children}</>
}

export function AlertDialogOverlay({ children, ...rest }: PropsOf<'div'>) @{
	const d = alertDialogState();
	<div data-state={d.open ? 'open' : 'closed'} {...rest} el={d.overlayEl} style="pointer-events: auto;" hidden>{children}</div>
}

export function AlertDialogContent({ children, ...rest }: PropsOf<'div'>) @{
	const d = alertDialogState();
	<div
		role="alertdialog"
		aria-describedby={d.descriptionEl}
		aria-labelledby={d.titleEl}
		data-state={d.open ? 'open' : 'closed'}
		{...rest}
		el={d.contentEl}
		tabindex={-1}
		style="pointer-events: auto;"
		hidden
		onIdle={() => {
			installDialog(d.triggerEl, d.overlayEl, d.contentEl, d.cancelEl, true);
		}}
		onRadixdismiss={() => {
			d.setOpen(false);
		}}
	>{children}</div>
}

export function AlertDialogTitle({ children, ...rest }: PropsOf<'h2'>) @{
	const d = alertDialogState();
	<h2 {...rest} el={d.titleEl}>{children}</h2>
}

/** `asChild` over a <div>, as shadcn's confirm dialog writes it, renders the description as that <div>. */
export function AlertDialogDescription({ asChild, children, ...rest }: PropsOf<'p'> & { readonly asChild?: boolean }) @{
	const d = alertDialogState();
	const tag = asChild === true ? 'div' : 'p';
	<{tag} {...rest} el={d.descriptionEl}>{children}</{tag}>
}

export function AlertDialogAction({ children, onClick, ...rest }: PropsOf<'button'>) @{
	const d = alertDialogState();
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
