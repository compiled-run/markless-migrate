import { state } from '@markless/core';
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle, AlertDialogTrigger } from '../../../src/library/ports/radix-ui-react-dialog/alert-dialog.tsrx';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from '../../../src/library/ports/radix-ui-react-dialog/dialog.tsrx';

const button = 'inline-flex items-center rounded-md border px-3 py-1 text-sm';
const overlay = 'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const content = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg';
const slowOverlay = 'fixed inset-0 z-50 bg-black/50 duration-500 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const quickContent = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg';
const stillOverlay = 'fixed inset-0 z-50 bg-black/50';
const stillContent = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg sm:max-w-lg';
const sheet = 'fixed z-50 flex flex-col gap-4 bg-white shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500 inset-y-0 inset-e-0 h-full w-3/4 border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end sm:max-w-sm';
const closeX = 'absolute inset-e-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 data-[state=open]:bg-gray-100';

export default function Home() @{
	let mode = state('');
	// A dialog with a trigger in each of two exclusive places, as a header written once per layout has.
	const compact = Date.now() < 0;

	<main class="flex flex-col items-start gap-4 p-8" data-testid="page">
		<h1 class="text-2xl font-semibold">Settings</h1>
		<button type="button" data-testid="before" class={button}>Before</button>
		<DialogRoot>
			<DialogTrigger data-testid="a-trigger" data-slot="dialog-trigger" class={button}>Edit profile</DialogTrigger>
			<DialogPortal data-slot="dialog-portal">
				<DialogOverlay data-testid="a-overlay" data-slot="dialog-overlay" class={overlay}></DialogOverlay>
				<DialogContent data-testid="a-content" data-slot="dialog-content" class={content}>
					<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-start">
						<DialogTitle data-testid="a-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Edit profile</DialogTitle>
						<DialogDescription data-testid="a-description" data-slot="dialog-description" class="text-sm text-gray-500">Make changes to your profile here.</DialogDescription>
					</div>
					<a href="#help" data-testid="a-link" class="text-sm underline">Help</a>
					<input data-testid="a-name" class="rounded border px-2 py-1" value="Pedro Duarte" />
					<div data-slot="dialog-footer" class="flex justify-end gap-2">
						<DialogClose data-testid="a-cancel" class={button}>Cancel</DialogClose>
						<button type="button" data-testid="a-save" class={button}>Save</button>
					</div>
					<DialogClose data-testid="a-x" data-slot="dialog-close" class={closeX}><span class="sr-only">Close</span>x</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<DialogRoot>
			<DialogTrigger data-testid="b-trigger" class={button}>Slow backdrop</DialogTrigger>
			<DialogPortal>
				<DialogOverlay data-testid="b-overlay" class={slowOverlay}></DialogOverlay>
				<DialogContent data-testid="b-content" class={quickContent}>
					<DialogTitle data-testid="b-title">Slow backdrop</DialogTitle>
					<DialogDescription data-testid="b-description">The backdrop fades for 500 ms, the dialog for 100 ms.</DialogDescription>
					<DialogClose data-testid="b-close" class={button}>Done</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<DialogRoot>
			<DialogTrigger data-testid="c-trigger" class={button}>Still</DialogTrigger>
			<DialogPortal>
				<DialogOverlay data-testid="c-overlay" class={stillOverlay}></DialogOverlay>
				<DialogContent data-testid="c-content" class={stillContent}>
					<DialogTitle data-testid="c-title">No animation</DialogTitle>
					<DialogDescription data-testid="c-description">Nothing animates here.</DialogDescription>
					<DialogClose data-testid="c-close" class={button}>Done</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<DialogRoot>
			@if (compact) {
				<DialogTrigger data-testid="d-trigger-compact" data-slot="sheet-trigger" class={button}>Sheet</DialogTrigger>
			} @else {
				<DialogTrigger data-testid="d-trigger" data-slot="sheet-trigger" class={button}>Open sheet</DialogTrigger>
			}
			<DialogPortal data-slot="sheet-portal">
				<DialogOverlay data-testid="d-overlay" data-slot="sheet-overlay" class={overlay}></DialogOverlay>
				<DialogContent data-testid="d-content" data-slot="sheet-content" class={sheet}>
					<DialogTitle data-testid="d-title" data-slot="sheet-title">Theme settings</DialogTitle>
					<DialogDescription data-testid="d-description" data-slot="sheet-description">Adjust the appearance.</DialogDescription>
					<button type="button" data-testid="d-reset" class={button}>Reset</button>
					<DialogClose data-testid="d-x" class={closeX}><span class="sr-only">Close</span>x</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<button type="button" data-testid="e-trigger" class={button} onClick={() => { mode = 'rename'; }}>Rename</button>
		<DialogRoot open={mode === 'rename'} onOpenChange={(next: boolean) => { mode = next ? 'rename' : ''; }}>
			<DialogPortal>
				<DialogOverlay data-testid="e-overlay" class={overlay}></DialogOverlay>
				<DialogContent data-testid="e-content" class={content}>
					<DialogTitle data-testid="e-title">Rename</DialogTitle>
					<DialogDescription data-testid="e-description">Opened by the page, not by a trigger.</DialogDescription>
					<input data-testid="e-name" class="rounded border px-2 py-1" value="Report" autofocus />
					<button type="button" data-testid="e-save" class={button} onClick={() => { mode = ''; }}>Save</button>
					<DialogClose data-testid="e-close" class={button}>Cancel</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<AlertDialogRoot>
			<AlertDialogTrigger data-testid="f-trigger" data-slot="alert-dialog-trigger" class={button}>Sign out</AlertDialogTrigger>
			<AlertDialogPortal data-slot="alert-dialog-portal">
				<AlertDialogOverlay data-testid="f-overlay" data-slot="alert-dialog-overlay" class={overlay}></AlertDialogOverlay>
				<AlertDialogContent data-testid="f-content" data-slot="alert-dialog-content" class={content}>
					<AlertDialogTitle data-testid="f-title" data-slot="alert-dialog-title">Sign out</AlertDialogTitle>
					<AlertDialogDescription asChild data-testid="f-description" data-slot="alert-dialog-description">Are you sure you want to sign out?</AlertDialogDescription>
					<AlertDialogCancel data-testid="f-cancel" data-slot="alert-dialog-cancel" class={button}>Cancel</AlertDialogCancel>
					<AlertDialogAction data-testid="f-action" data-slot="alert-dialog-action" class={button}>Sign out</AlertDialogAction>
				</AlertDialogContent>
			</AlertDialogPortal>
		</AlertDialogRoot>
		<button type="button" data-testid="after" class={button}>After</button>
		<div data-testid="spacer" style="height: 2000px;" />
	</main>
}
