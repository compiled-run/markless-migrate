import { DEFAULTS, parseParams, parseSnapshot, serializeParams, snapshotOf, TYPESET_COMMAND_MESSAGE, TYPESET_PARAMS_MESSAGE, updateSearch, type TypesetKey, type TypesetParams } from './typeset-params.ts';

// What /typeset's hooks did in the browser beside rendering: the URL (nuqs, history "replace"), the undo history of
// URL snapshots (use-history), the hover previews (preview-override), the iframe's params and commands (preview.tsx),
// and the document's shortcuts. The page's state is Markless's: each change here returns what the state becomes, and
// what the document hears is handed to the page as a `typesetcommand` event on its root.

export interface TypesetView {
	readonly params: TypesetParams;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
	readonly previewSrc: string;
}

export const PREVIEW_OVERRIDE_DEBOUNCE_MS = 50;
const APPLE_PLATFORM_REGEX = /Mac|iPhone|iPad|iPod/;

let entries: string[] = [];
let index = 0;
let maxIndex = 0;
let navigating = false;
let seeded = false;
let previewSrc = serializeParams(`/preview/typeset/${DEFAULTS.item}`, DEFAULTS);
let previewItem = DEFAULTS.item;
let lastSent: TypesetParams | null = null;
let override: Partial<TypesetParams> | null = null;
let overrideTimer: number | null = null;

const current = () => parseParams(location.search);
const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="typeset preview"]');
const view = (params: TypesetParams): TypesetView => ({ params, canGoBack: index > 0, canGoForward: index < maxIndex, previewSrc });
const same = (a: Partial<TypesetParams> | null, b: Partial<TypesetParams> | null) => {
	if (a === b) return true;
	if (!a || !b) return false;
	const keys = Object.keys(a) as TypesetKey[];
	return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

// use-history's effect on each settled URL: the first seeds the stack, a restore is skipped, a new one drops the redo tail.
function record(search: string): void {
	const snapshot = snapshotOf(search);
	if (!seeded) {
		seeded = true;
		entries = [snapshot];
		return;
	}
	if (navigating) {
		navigating = false;
		return;
	}
	if (snapshot === entries[index]) return;
	entries = [...entries.slice(0, index + 1), snapshot];
	index = entries.length - 1;
	maxIndex = index;
}

// preview.tsx: a new specimen reloads the iframe with the params in its URL; any other change is posted to it, once.
function syncPreview(params: TypesetParams): void {
	const merged = override ? { ...params, ...override } : params;
	if (merged.item !== previewItem) {
		previewItem = merged.item;
		previewSrc = serializeParams(`/preview/typeset/${merged.item}`, merged);
		return;
	}
	if (lastSent && (Object.keys(merged) as TypesetKey[]).every((k) => lastSent![k] === merged[k])) return;
	send(merged);
}

function send(merged: TypesetParams): void {
	frame()?.contentWindow?.postMessage({ type: TYPESET_PARAMS_MESSAGE, data: merged }, location.origin);
	lastSent = merged;
}

/** setParams(update) with history "replace": the URL takes it, the history records it, the preview follows. */
export function commit(update: Partial<Record<TypesetKey, string | null>> | null): TypesetView {
	const search = updateSearch(location.search, update);
	if (search !== location.search) history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
	record(search);
	const params = current();
	syncPreview(params);
	return view(params);
}

function restore(to: number): TypesetView {
	navigating = true;
	index = to;
	return commit(parseSnapshot(entries[to]!));
}
/** useHistory's goBack and goForward: the entry before or after, or the view as it is when there is none. */
export const undo = (): TypesetView => (index <= 0 ? now() : restore(index - 1));
export const redo = (): TypesetView => (index >= maxIndex ? now() : restore(index + 1));

/** A picker item hovered or focused: the preview shows it once the pointer settles; the URL never does. */
export function hover(next: Partial<TypesetParams>): void {
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

/** The document's own shortcuts on /typeset: R shuffles, ⇧R resets, ⌘Z undoes, ⇧⌘Z or Ctrl+Y redoes (D is the site's). */
export function shortcut(event: KeyboardEvent): string | undefined {
	if (editable(event.target)) return undefined;
	if (event.metaKey || event.ctrlKey) {
		const key = event.key.toLowerCase();
		if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) return 'redo';
		if (key === 'z') return 'undo';
		return undefined;
	}
	if (event.altKey) return undefined;
	if (event.key === 'r' || event.key === 'R') return event.shiftKey ? 'reset' : 'shuffle';
	return undefined;
}

/**
 * Starts what the page's hooks did once mounted, on the page's root: the history seeded from the URL, the preview
 * reloaded with the URL's params, the shortcuts, the iframe's forwarded commands, the viewport and the platform. Each
 * is handed to the page as a `typesetcommand` event on `root` ('load' first).
 */
export function start(root: Element): () => void {
	const params = current();
	record(location.search);
	previewItem = params.item;
	previewSrc = serializeParams(`/preview/typeset/${params.item}`, params);
	const tell = (command: string) => root.dispatchEvent(new CustomEvent('typesetcommand', { detail: command }));
	const onKey = (event: KeyboardEvent) => {
		const command = shortcut(event);
		if (!command) return;
		event.preventDefault();
		tell(command);
	};
	const onMessage = (event: MessageEvent) => {
		const win = frame()?.contentWindow;
		const data = event.data as { type?: unknown; command?: unknown } | null;
		if (!win || event.origin !== location.origin || event.source !== win || !data || typeof data !== 'object' || data.type !== TYPESET_COMMAND_MESSAGE) return;
		if (typeof data.command === 'string' && ['shuffle', 'reset', 'undo', 'redo', 'toggle-theme'].includes(data.command)) tell(data.command);
	};
	const mobile = matchMedia('(max-width: 767px)');
	const onViewport = () => tell('viewport');
	const onLoad = () => {
		const p = current();
		send(override ? { ...p, ...override } : p);
	};
	const iframe = frame();
	// A picker's onOpenChange(false): the menu part marks its trigger closed, and the hover preview goes.
	const closed = new MutationObserver((records) => {
		if (records.some((r) => r.target instanceof Element && r.target.getAttribute('aria-expanded') === 'false')) unhover();
	});
	for (const trigger of root.querySelectorAll('[data-typeset-picker]')) closed.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
	document.addEventListener('keydown', onKey);
	window.addEventListener('message', onMessage);
	mobile.addEventListener('change', onViewport);
	iframe?.addEventListener('load', onLoad);
	tell('load');
	return () => {
		closed.disconnect();
		document.removeEventListener('keydown', onKey);
		window.removeEventListener('message', onMessage);
		mobile.removeEventListener('change', onViewport);
		iframe?.removeEventListener('load', onLoad);
	};
}

/** The params, history and preview as they are now. */
export const now = (): TypesetView => view(current());
export const isMobile = (): boolean => window.innerWidth < 768;
export const isMac = (): boolean => APPLE_PLATFORM_REGEX.test(navigator.platform || navigator.userAgent);

/** use-config's `config` (jotai atomWithStorage): the package manager the docs show commands for. */
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

let css: Promise<string> | undefined;
/** /typeset.css, fetched once, as the docs panel fetched it on mount. */
export const typesetCss = (): Promise<string> => (css ??= fetch('/typeset.css').then((r) => r.text()));

/** Writes `text` to the clipboard; resolves once written. */
export const copyText = (text: string | Promise<string>): Promise<void> => Promise.resolve(text).then((t) => navigator.clipboard.writeText(t));
