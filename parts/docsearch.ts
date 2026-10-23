// DocSearch 3 (Algolia) as its own button runs it, without its code at load: the library loads on the first intent to
// search (the pointer over its button, a press, focus, Cmd/Ctrl+K or /), and a press or shortcut made while it loads
// opens it once it has. The button carries its config as data-mm-docsearch='{"appId":…,"apiKey":…,"indexName":…}'.
// DocSearch renders its own button into a hidden holder after <body>, outside the page Markless renders, and the page's
// button opens it.

export interface DocSearchConfig {
	readonly appId: string;
	readonly apiKey: string;
	readonly indexName: string;
	/** The script that defines window.docsearch; @docsearch/js 3 from jsDelivr when absent. */
	readonly src?: string;
	readonly [option: string]: unknown;
}

export const ATTRIBUTE = 'data-mm-docsearch';
const SCRIPT = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';

let state: 'idle' | 'loading' | 'ready' = 'idle';
let pending = false;
let holder: HTMLElement | null = null;

const button = (target: Element) => target.closest<HTMLElement>(`[${ATTRIBUTE}]`);
const configOf = () => {
	const el = document.querySelector(`[${ATTRIBUTE}]`);
	try {
		return el ? (JSON.parse(el.getAttribute(ATTRIBUTE) ?? '') as DocSearchConfig) : undefined;
	} catch {
		return undefined;
	}
};

function open(): void {
	holder?.querySelector<HTMLElement>('.DocSearch-Button')?.click();
}

function load(): void {
	if (state !== 'idle') return;
	const config = configOf();
	if (!config) return;
	state = 'loading';
	const { src = SCRIPT, ...options } = config;
	const script = document.createElement('script');
	script.src = src;
	script.onload = () => {
		// The holder sits after <body>, outside the page Markless renders and resumes by position.
		const made = document.createElement('div');
		made.hidden = true;
		document.documentElement.append(made);
		holder = made;
		(window as unknown as { docsearch: (o: object) => void }).docsearch({ ...options, container: holder });
		state = 'ready';
		if (pending) {
			pending = false;
			open();
		}
	};
	script.onerror = () => {
		state = 'idle';
		script.remove();
	};
	document.head.append(script);
}

function request(): void {
	if (state === 'ready') open();
	else {
		pending = true;
		load();
	}
}

const editing = (target: Element) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

const intent = (target: Element) => {
	if (!button(target)) return false;
	load();
	return false;
};

export const pointerover = intent;
export const pointerdown = intent;
export const focusin = intent;

export function click(target: Element): boolean {
	if (!button(target)) return false;
	request();
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (state === 'ready' || pending || !document.querySelector(`[${ATTRIBUTE}]`)) return false;
	const key = String(event.key).toLowerCase();
	const shortcut = key === 'k' ? event.metaKey || event.ctrlKey : event.key === '/' ? !editing(target) : false;
	if (!shortcut) return false;
	event.preventDefault();
	request();
	return true;
}

/**
 * Inline script for the document's head, run before the first paint: the button shows the key of the visitor's platform,
 * ⌘ on Apple platforms and Ctrl elsewhere, and off Apple platforms announces "Search (Ctrl+K)", as DocSearch's own button
 * does; a button an in-place navigation brings in is labelled too. Must stay self-contained.
 */
export function platformKeys(): void {
	const w = window as unknown as { __mmDocsearchKeys?: boolean };
	if (w.__mmDocsearchKeys) return;
	w.__mmDocsearchKeys = true;
	const apple = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
	const style = document.createElement('style');
	style.append(apple ? '[data-mm-docsearch] [data-mm-key="ctrl"]{display:none}' : '[data-mm-docsearch] [data-mm-key="apple"]{display:none}');
	document.head.append(style);
	if (apple) return;
	const label = () => {
		for (const el of document.querySelectorAll('[data-mm-docsearch]')) if (el.getAttribute('aria-label') !== 'Search (Ctrl+K)') el.setAttribute('aria-label', 'Search (Ctrl+K)');
	};
	label();
	new MutationObserver((records) => {
		if (records.some((r) => r.addedNodes.length)) label();
	}).observe(document.documentElement, { childList: true, subtree: true });
}

/** The head script that runs platformKeys before the first paint. */
export const PLATFORM_KEYS_SCRIPT = `(${platformKeys.toString()})();`;
