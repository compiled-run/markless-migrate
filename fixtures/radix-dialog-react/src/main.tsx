import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const button = 'inline-flex items-center rounded-md border px-3 py-1 text-sm';
const overlay = 'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const content = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg';
const slowOverlay = 'fixed inset-0 z-50 bg-black/50 duration-500 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const quickContent = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg';
const stillOverlay = 'fixed inset-0 z-50 bg-black/50';
const stillContent = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-white p-6 shadow-lg sm:max-w-lg';
const sheet = 'fixed z-50 flex flex-col gap-4 bg-white shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500 inset-y-0 inset-e-0 h-full w-3/4 border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end sm:max-w-sm';
const closeX = 'absolute inset-e-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 data-[state=open]:bg-gray-100';

function App() {
	const [mode, setMode] = useState('');
	return (
		<main className="flex flex-col items-start gap-4 p-8" data-testid="page">
			<h1 className="text-2xl font-semibold">Settings</h1>
			<button type="button" data-testid="before" className={button}>Before</button>
			<Dialog.Root>
				<Dialog.Trigger data-testid="a-trigger" data-slot="dialog-trigger" className={button}>Edit profile</Dialog.Trigger>
				<Dialog.Portal data-slot="dialog-portal">
					<Dialog.Overlay data-testid="a-overlay" data-slot="dialog-overlay" className={overlay} />
					<Dialog.Content data-testid="a-content" data-slot="dialog-content" className={content}>
						<div data-slot="dialog-header" className="flex flex-col gap-2 text-center sm:text-start">
							<Dialog.Title data-testid="a-title" data-slot="dialog-title" className="text-lg leading-none font-semibold">Edit profile</Dialog.Title>
							<Dialog.Description data-testid="a-description" data-slot="dialog-description" className="text-sm text-gray-500">Make changes to your profile here.</Dialog.Description>
						</div>
						<a href="#help" data-testid="a-link" className="text-sm underline">Help</a>
						<input data-testid="a-name" className="rounded border px-2 py-1" defaultValue="Pedro Duarte" />
						<div data-slot="dialog-footer" className="flex justify-end gap-2">
							<Dialog.Close data-testid="a-cancel" className={button}>Cancel</Dialog.Close>
							<button type="button" data-testid="a-save" className={button}>Save</button>
						</div>
						<Dialog.Close data-testid="a-x" data-slot="dialog-close" className={closeX}><span className="sr-only">Close</span>x</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
			<Dialog.Root>
				<Dialog.Trigger data-testid="b-trigger" className={button}>Slow backdrop</Dialog.Trigger>
				<Dialog.Portal>
					<Dialog.Overlay data-testid="b-overlay" className={slowOverlay} />
					<Dialog.Content data-testid="b-content" className={quickContent}>
						<Dialog.Title data-testid="b-title">Slow backdrop</Dialog.Title>
						<Dialog.Description data-testid="b-description">The backdrop fades for 500 ms, the dialog for 100 ms.</Dialog.Description>
						<Dialog.Close data-testid="b-close" className={button}>Done</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
			<Dialog.Root>
				<Dialog.Trigger data-testid="c-trigger" className={button}>Still</Dialog.Trigger>
				<Dialog.Portal>
					<Dialog.Overlay data-testid="c-overlay" className={stillOverlay} />
					<Dialog.Content data-testid="c-content" className={stillContent}>
						<Dialog.Title data-testid="c-title">No animation</Dialog.Title>
						<Dialog.Description data-testid="c-description">Nothing animates here.</Dialog.Description>
						<Dialog.Close data-testid="c-close" className={button}>Done</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
			<Dialog.Root>
				<Dialog.Trigger data-testid="d-trigger" data-slot="sheet-trigger" className={button}>Open sheet</Dialog.Trigger>
				<Dialog.Portal data-slot="sheet-portal">
					<Dialog.Overlay data-testid="d-overlay" data-slot="sheet-overlay" className={overlay} />
					<Dialog.Content data-testid="d-content" data-slot="sheet-content" className={sheet}>
						<Dialog.Title data-testid="d-title" data-slot="sheet-title">Theme settings</Dialog.Title>
						<Dialog.Description data-testid="d-description" data-slot="sheet-description">Adjust the appearance.</Dialog.Description>
						<button type="button" data-testid="d-reset" className={button}>Reset</button>
						<Dialog.Close data-testid="d-x" className={closeX}><span className="sr-only">Close</span>x</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
			<button type="button" data-testid="e-trigger" className={button} onClick={() => setMode('rename')}>Rename</button>
			<Dialog.Root open={mode === 'rename'} onOpenChange={(next) => setMode(next ? 'rename' : '')}>
				<Dialog.Portal>
					<Dialog.Overlay data-testid="e-overlay" className={overlay} />
					<Dialog.Content data-testid="e-content" className={content}>
						<Dialog.Title data-testid="e-title">Rename</Dialog.Title>
						<Dialog.Description data-testid="e-description">Opened by the page, not by a trigger.</Dialog.Description>
						<input data-testid="e-name" className="rounded border px-2 py-1" defaultValue="Report" autoFocus />
						<button type="button" data-testid="e-save" className={button} onClick={() => setMode('')}>Save</button>
						<Dialog.Close data-testid="e-close" className={button}>Cancel</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
			<AlertDialog.Root>
				<AlertDialog.Trigger data-testid="f-trigger" data-slot="alert-dialog-trigger" className={button}>Sign out</AlertDialog.Trigger>
				<AlertDialog.Portal data-slot="alert-dialog-portal">
					<AlertDialog.Overlay data-testid="f-overlay" data-slot="alert-dialog-overlay" className={overlay} />
					<AlertDialog.Content data-testid="f-content" data-slot="alert-dialog-content" className={content}>
						<AlertDialog.Title data-testid="f-title" data-slot="alert-dialog-title">Sign out</AlertDialog.Title>
						<AlertDialog.Description asChild>
							<div data-testid="f-description" data-slot="alert-dialog-description">Are you sure you want to sign out?</div>
						</AlertDialog.Description>
						<AlertDialog.Cancel data-testid="f-cancel" data-slot="alert-dialog-cancel" className={button}>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action data-testid="f-action" data-slot="alert-dialog-action" className={button}>Sign out</AlertDialog.Action>
					</AlertDialog.Content>
				</AlertDialog.Portal>
			</AlertDialog.Root>
			<button type="button" data-testid="after" className={button}>After</button>
			<div data-testid="spacer" style={{ height: 2000 }} />
		</main>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
