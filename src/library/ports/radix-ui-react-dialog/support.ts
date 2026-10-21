import type { LibraryPort } from '../../types.ts';

const VERSION = '1.1.15';
const CERTIFIED_BY = 'test/e2e/radix-dialog-port.test.ts';
const FILES = ['dialog.tsrx', 'alert-dialog.tsrx', 'engine.ts'] as const;

// Element props (class, id, data-*, aria-*, on* events) pass through to the element each part renders.
const content = {
	props: ['children'],
	unsupported: {
		forceMount: 'the part is always rendered, hidden while closed',
		asChild: 'the part renders its own <div>',
		onOpenAutoFocus: 'the opening focus is always Radix\'s default',
		onCloseAutoFocus: 'the closing focus always returns to the trigger',
		onEscapeKeyDown: 'Escape always closes the dialog',
		onPointerDownOutside: 'a press outside always closes the dialog (an alert dialog never)',
		onInteractOutside: 'a press outside always closes the dialog (an alert dialog never)',
	},
};
const NOTES = [
	"A control the old app writes with React's autoFocus: write the autofocus attribute on it. The port focuses it as the dialog opens, as React does, and takes the attribute off.",
	'The parts stay in the page, hidden while closed, and keep their elements between openings, where React mounts new ones. A field the old app leaves uncontrolled would keep what was typed: bind it to state and reset that state when the dialog opens.',
	'Not covered: a second dialog opened while another is open (stacked dialogs), and the non-modal dialog.',
	'A menu, select or popover port marked with data-radix-popper-content-wrapper is a layer above an open dialog, as Radix\'s own are: shown, it moves after the dialog and stays exposed, and presses, focus and Escape inside it are its own.',
	'A live region the page keeps hidden is marked hidden with the rest of the page; aria-hidden keeps every live region, but a hidden one announces nothing.',
	'A dialog the page opens through its own state rather than a trigger is wired when the page goes idle; opened before that, it gains its focus handling once the port has loaded.',
];

const button = (component: string) => ({ component, props: ['children', 'onClick', 'asChild'], unsupported: {}, note: 'asChild: render the part with the child button\'s own classes and attributes; the part is that <button>' });

/** The Markless port of @radix-ui/react-dialog: which component replaces each export, and the props it covers. */
export const RADIX_DIALOG: LibraryPort = {
	library: '@radix-ui/react-dialog',
	version: VERSION,
	certifiedBy: CERTIFIED_BY,
	dir: 'radix-ui-react-dialog',
	module: 'dialog.tsrx',
	files: FILES,
	notes: NOTES,
	parts: {
		Root: { component: 'DialogRoot', props: ['open', 'defaultOpen', 'onOpenChange', 'children'], unsupported: { modal: 'only the modal dialog (the default) is ported' } },
		Trigger: button('DialogTrigger'),
		Portal: { component: 'DialogPortal', props: ['children'], unsupported: { container: 'each part moves to the end of its Markless container as it opens', forceMount: 'the parts are always rendered, hidden while closed' } },
		Overlay: { component: 'DialogOverlay', props: ['children'], unsupported: { forceMount: content.unsupported.forceMount, asChild: content.unsupported.asChild } },
		Content: { component: 'DialogContent', ...content },
		Title: { component: 'DialogTitle', props: ['children'], unsupported: { asChild: 'the part renders its own <h2>' } },
		Description: { component: 'DialogDescription', props: ['children', 'asChild'], unsupported: {}, note: 'asChild: the child is a <div>; write its content inside the part and the part renders that <div>' },
		Close: button('DialogClose'),
	},
};

/** The Markless port of @radix-ui/react-alert-dialog, in the same directory as the dialog it is built on. */
export const RADIX_ALERT_DIALOG: LibraryPort = {
	library: '@radix-ui/react-alert-dialog',
	version: VERSION,
	certifiedBy: CERTIFIED_BY,
	dir: 'radix-ui-react-dialog',
	module: 'alert-dialog.tsrx',
	files: FILES,
	notes: NOTES,
	parts: {
		Root: { component: 'AlertDialogRoot', props: ['open', 'defaultOpen', 'onOpenChange', 'children'], unsupported: {} },
		Trigger: button('AlertDialogTrigger'),
		Portal: { component: 'AlertDialogPortal', props: ['children'], unsupported: RADIX_DIALOG.parts.Portal!.unsupported },
		Overlay: { component: 'AlertDialogOverlay', props: ['children'], unsupported: RADIX_DIALOG.parts.Overlay!.unsupported },
		Content: { component: 'AlertDialogContent', ...content },
		Title: { component: 'AlertDialogTitle', props: ['children'], unsupported: RADIX_DIALOG.parts.Title!.unsupported },
		Description: { ...RADIX_DIALOG.parts.Description!, component: 'AlertDialogDescription' },
		Cancel: { ...button('AlertDialogCancel'), note: 'takes the opening focus; asChild as for Trigger' },
		Action: button('AlertDialogAction'),
	},
};
