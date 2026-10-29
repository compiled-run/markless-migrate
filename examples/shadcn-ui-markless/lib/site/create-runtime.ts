import { generateRandomPreset } from 'shadcn/preset';
import { configure } from '../parts/cmdk.ts';
import {
	CMD_K_FORWARD_TYPE,
	DARK_MODE_FORWARD_TYPE,
	DESIGN_SYSTEM_MESSAGE,
	DESIGN_SYSTEM_READY,
	OPEN_PRESET_FORWARD_TYPE,
	DEFAULTS,
	parseParams,
	presetUrlUpdate,
	previewSrcOf,
	RANDOMIZE_FORWARD_TYPE,
	REDO_FORWARD_TYPE,
	RESET_FORWARD_TYPE,
	setParamsUpdate,
	UNDO_FORWARD_TYPE,
	updateSearch,
	type CreateKey,
	type CreateParams,
	type CreateUpdate,
} from './create-params.ts';

// What /create's hooks did in the browser beside rendering: the URL (nuqs, history "push" unless a hook asks "replace",
// popstate read back), the undo history over the preset code (use-history), the hover previews (preview-override), the
// iframe's params and the keys it forwards (preview.tsx), and the document's shortcuts (use-random, use-reset,
// use-open-preset, use-action-menu, use-history). The page's state is Markless's: each change here returns what the state
// becomes, and what the document hears is handed to the page as a `createcommand` event on its root.

export interface CreateView {
	readonly params: CreateParams;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
	readonly previewSrc: string;
	/** The menu accent last picked on a solid menu: going back to solid restores it (MenuColorPicker's lastSolidMenuAccentRef). */
	readonly solidAccent: string;
}

export const START: CreateView = { params: DEFAULTS, canGoBack: false, canGoForward: false, previewSrc: previewSrcOf(DEFAULTS), solidAccent: DEFAULTS.menuAccent };

export const PREVIEW_OVERRIDE_DEBOUNCE_MS = 50;

// ActionMenu's CommandItem onSelect: the item it previews reaches the palette as `createchoose`.
configure({
	applies: (root) => root.hasAttribute('data-create-palette'),
	beforeChoose: (item) => item.dispatchEvent(new CustomEvent('createchoose', { bubbles: true, detail: item.dataset.createItem })),
});
const MAC_REGEX = /Mac|iPhone|iPad|iPod/;

let entries: string[] = [''];
let index = 0;
let maxIndex = 0;
let navigating = false;
let frameKey = '';
let previewSrc = '';
let lastSent: CreateParams | null = null;
let override: CreateUpdate | null = null;
let overrideTimer: number | null = null;

const current = () => parseParams(location.search);
const frame = () => document.querySelector<HTMLIFrameElement>('[data-slot="designer"] iframe[title="Preview"]');
let solidAccent = 'subtle';
function view(params: CreateParams): CreateView {
	if (params.menuColor !== 'default-translucent' && params.menuColor !== 'inverted-translucent') solidAccent = params.menuAccent;
	return { params, canGoBack: index > 0, canGoForward: index < maxIndex, previewSrc, solidAccent };
}
const same = (a: object | null, b: object | null) => {
	if (a === b) return true;
	if (!a || !b) return false;
	const ak = Object.keys(a) as (keyof typeof a)[];
	return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k]);
};

// HistoryProvider's effect on each settled preset: a restore is skipped, a new one drops the redo tail.
function record(): void {
	const preset = new URLSearchParams(location.search).get('preset') ?? '';
	if (navigating) {
		navigating = false;
		return;
	}
	if (preset === entries[index]) return;
	entries = [...entries.slice(0, index + 1), preset];
	index = entries.length - 1;
	maxIndex = index;
}

// preview.tsx: a new base or item reloads the iframe (keyed by them) with the params in its URL; any other change is
// posted to it, unless it is what it last got.
function syncPreview(params: CreateParams): void {
	const merged = override ? ({ ...params, ...override } as CreateParams) : params;
	const key = params.base + params.item;
	if (key !== frameKey) {
		frameKey = key;
		previewSrc = previewSrcOf(params);
		lastSent = null;
		return;
	}
	if (frame()?.contentWindow && !same(lastSent, merged)) send(merged);
}

function send(merged: CreateParams): void {
	frame()?.contentWindow?.postMessage({ type: DESIGN_SYSTEM_MESSAGE, data: merged }, '*');
	lastSent = merged;
}

function write(search: string, mode: 'push' | 'replace'): void {
	if (search === location.search) return;
	const url = `${location.pathname}${search}${location.hash}`;
	if (mode === 'push') history.pushState(history.state, '', url);
	else history.replaceState(history.state, '', url);
}

/** setParams(updates, { history }): the URL takes the raw update, the history records the preset, the preview follows. */
export function commit(updates: CreateUpdate, mode: 'push' | 'replace' = 'push'): CreateView {
	write(updateSearch(location.search, setParamsUpdate(current(), updates)), mode);
	record();
	const params = current();
	syncPreview(params);
	return view(params);
}

function restore(to: number): CreateView {
	navigating = true;
	index = to;
	write(updateSearch(location.search, { preset: entries[to] || null }), 'replace');
	record();
	const params = current();
	syncPreview(params);
	return view(params);
}
/** useHistory's goBack and goForward: the preset before or after, or the view as it is when there is none. */
export const undo = (): CreateView => (index <= 0 ? now() : restore(index - 1));
export const redo = (): CreateView => (index >= maxIndex ? now() : restore(index + 1));

/** A picker item hovered or focused: the preview shows it once the pointer settles; the URL never does. */
export function hover(next: CreateUpdate): void {
	if (overrideTimer !== null) clearTimeout(overrideTimer);
	overrideTimer = window.setTimeout(() => {
		overrideTimer = null;
		if (same(override, next)) return;
		override = next;
		syncPreview(current());
	}, PREVIEW_OVERRIDE_DEBOUNCE_MS);
}

/** The pointer left the menu, or it closed: the preview goes back to the committed params at once. */
export function unhover(): void {
	if (overrideTimer !== null) clearTimeout(overrideTimer);
	overrideTimer = null;
	if (override === null) return;
	override = null;
	syncPreview(current());
}

const editable = (t: EventTarget | null) => (t instanceof HTMLElement && t.isContentEditable) || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

/** The document's own shortcuts on /create (D is the site's): what each asks the page to do. */
export function shortcut(event: KeyboardEvent): string | undefined {
	const key = event.key;
	if ((event.metaKey || event.ctrlKey) && key === 'p') return 'toggle-action-menu';
	if (editable(event.target)) return undefined;
	if (event.metaKey || event.ctrlKey) {
		const lower = key.toLowerCase();
		if ((lower === 'z' && event.shiftKey) || (lower === 'y' && event.ctrlKey)) return 'redo';
		if (lower === 'z') return 'undo';
		return undefined;
	}
	if (key === 'r' && !event.shiftKey) return 'shuffle';
	if (key === 'R' && event.shiftKey) return 'reset';
	if (key === 'o' && !event.shiftKey && !event.altKey) return 'open-preset';
	return undefined;
}

// preview.tsx: what the iframe forwards is pressed again on this document, as the keys it stands for.
function forwarded(data: { type?: unknown; key?: unknown }): KeyboardEventInit | undefined {
	const mac = MAC_REGEX.test(navigator.userAgent);
	const key = typeof data.key === 'string' && data.key ? data.key : undefined;
	if (data.type === CMD_K_FORWARD_TYPE) return { key: key ?? 'k', metaKey: mac, ctrlKey: !mac };
	if (data.type === RANDOMIZE_FORWARD_TYPE) return { key: key ?? 'r' };
	if (data.type === OPEN_PRESET_FORWARD_TYPE) return { key: key ?? 'o' };
	if (data.type === UNDO_FORWARD_TYPE) return { key: 'z', metaKey: mac, ctrlKey: !mac };
	if (data.type === REDO_FORWARD_TYPE) return { key: 'z', shiftKey: true, metaKey: mac, ctrlKey: !mac };
	if (data.type === RESET_FORWARD_TYPE) return { key: 'R', shiftKey: true };
	if (data.type === DARK_MODE_FORWARD_TYPE) return { key: key ?? 'd' };
	return undefined;
}

/**
 * Starts what the page's hooks did once mounted, on the page's root: a URL without a preset code gets one (replaced in
 * place), the history and the preview start from the URL, and the shortcuts, the iframe's forwarded keys, the browser's
 * back and forward, the viewport and the platform are handed to the page as `createcommand` events ('load' first).
 */
export function start(root: Element): () => void {
	const query = new URLSearchParams(location.search);
	// PresetHandler: ?preset=random is replaced by a random preset, alone in the URL.
	if (query.get('preset') === 'random') write(`?preset=${generateRandomPreset()}`, 'replace');
	else if (!query.has('preset')) write(updateSearch(location.search, presetUrlUpdate(current())), 'replace');
	record();
	const params = current();
	frameKey = params.base + params.item;
	previewSrc = previewSrcOf(params);
	const tell = (command: string) => root.dispatchEvent(new CustomEvent('createcommand', { detail: command }));
	const onKey = (event: KeyboardEvent) => {
		const command = shortcut(event);
		if (!command) return;
		event.preventDefault();
		// use-reset's two listeners see each other's update only when React flushes between them, as it does for a real
		// key: Shift+R forwarded from the preview (dispatched here) toggles the dialog instead of resetting at once.
		tell(command === 'reset' && !event.isTrusted ? 'reset-forwarded' : command);
	};
	const onMessage = (event: MessageEvent) => {
		const win = frame()?.contentWindow;
		const data = event.data as { type?: unknown; key?: unknown } | null;
		if (!win || event.origin !== location.origin || event.source !== win || !data || typeof data !== 'object') return;
		const init = forwarded(data);
		// On the body, so it bubbles to the document as the old page's did, and the site's parts see an element target.
		if (init) document.body.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }));
		if (data.type === DESIGN_SYSTEM_READY) send(override ? ({ ...current(), ...override } as CreateParams) : current());
	};
	const onPop = () => {
		record();
		syncPreview(current());
		tell('popstate');
	};
	const mobile = matchMedia('(max-width: 767px)');
	const onViewport = () => tell('viewport');
	// next-themes switches the class on <html>: the menu color picker's Inverted is off in the dark.
	const theme = new MutationObserver(() => tell('theme'));
	theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	const onLoad = () => {
		const p = current();
		send(override ? ({ ...p, ...override } as CreateParams) : p);
	};
	const iframe = frame();
	// A picker's onOpenChange(false): the menu part marks its trigger closed, and the hover preview goes.
	const closed = new MutationObserver((records) => {
		if (records.some((r) => r.target instanceof Element && r.target.getAttribute('aria-expanded') === 'false')) unhover();
	});
	for (const trigger of root.querySelectorAll('[data-create-picker]')) closed.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
	// The iframe is keyed by base and item: React mounts a new one, whose load posts the params.
	const frames = new MutationObserver(() => {
		const next = frame();
		if (next && !next.dataset.createListening) {
			next.dataset.createListening = '';
			next.addEventListener('load', onLoad);
		}
	});
	frames.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
	if (iframe) {
		iframe.dataset.createListening = '';
		iframe.addEventListener('load', onLoad);
	}
	document.addEventListener('keydown', onKey);
	window.addEventListener('message', onMessage);
	window.addEventListener('popstate', onPop);
	mobile.addEventListener('change', onViewport);
	tell('load');
	if (iframe?.contentWindow) send(current());
	return () => {
		closed.disconnect();
		frames.disconnect();
		theme.disconnect();
		document.removeEventListener('keydown', onKey);
		window.removeEventListener('message', onMessage);
		window.removeEventListener('popstate', onPop);
		mobile.removeEventListener('change', onViewport);
	};
}

/** The params, history and preview as they are now. */
export const now = (): CreateView => view(current());
export const isMobile = (): boolean => window.innerWidth < 768;
export const isDark = (): boolean => document.documentElement.classList.contains('dark');
export const isMac = (): boolean => MAC_REGEX.test(navigator.platform || navigator.userAgent);
export const valueOf = (params: CreateParams, key: CreateKey): string => String(params[key]);

/** use-config's `config` (jotai atomWithStorage): the package manager Get Code shows commands for. */
export function packageManager(): string {
	try {
		const config = JSON.parse(localStorage.getItem('config') ?? 'null') as { packageManager?: string } | null;
		return config?.packageManager || 'pnpm';
	} catch {
		return 'pnpm';
	}
}
export function choosePackageManager(pm: string): void {
	let config: Record<string, unknown> = { style: 'new-york-v4', packageManager: 'pnpm', installationType: 'cli' };
	try {
		config = { ...config, ...(JSON.parse(localStorage.getItem('config') ?? '{}') as Record<string, unknown>) };
	} catch {}
	localStorage.setItem('config', JSON.stringify({ ...config, packageManager: pm }));
}

/** Writes `text` to the clipboard; resolves once written. */
export const copyText = (text: string): Promise<void> => navigator.clipboard.writeText(text);
