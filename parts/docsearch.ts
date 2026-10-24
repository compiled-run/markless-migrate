// DocSearch 3 (Algolia) as its own button runs it, without its code at load: the library loads on the first intent to
// search (the pointer over its button, a press, focus, Cmd/Ctrl+K or /), and a press or shortcut made while it loads
// opens it once it has. The button carries its config as data-mm-docsearch='{"appId":…,"apiKey":…,"indexName":…}'.
// It runs as an inline script in the document's head, so the first press answers without fetching code.
// TODO(post-launch): rebuild on the Markless-built DocSearch 4 dialog of the Docusaurus port, so no port loads DocSearch's own UI runtime (Preact).

export interface DocSearchConfig {
	readonly appId: string;
	readonly apiKey: string;
	readonly indexName: string;
	/** The script that defines window.docsearch; @docsearch/js 3 from jsDelivr when absent. */
	readonly src?: string;
	readonly [option: string]: unknown;
}

/**
 * Runs in the page before the first paint, once: must stay self-contained. The button shows the visitor's platform key
 * (⌘ on Apple platforms, Ctrl elsewhere, where it also announces "Search (Ctrl+K)"), a button an in-place navigation
 * brings in included. DocSearch renders its own button into a hidden holder after <body>, outside the page Markless
 * renders, and the page's button opens it.
 */
export function docsearchOnIntent(): void {
	const w = window as unknown as { __mmDocsearch?: boolean; docsearch?: (o: object) => void };
	if (w.__mmDocsearch) return;
	w.__mmDocsearch = true;
	const ATTRIBUTE = 'data-mm-docsearch';
	const apple = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
	const style = document.createElement('style');
	style.append(apple ? '[data-mm-docsearch] [data-mm-key="ctrl"]{display:none}' : '[data-mm-docsearch] [data-mm-key="apple"]{display:none}');
	document.head.append(style);
	if (!apple) {
		const label = () => {
			for (const el of document.querySelectorAll(`[${ATTRIBUTE}]`)) if (el.getAttribute('aria-label') !== 'Search (Ctrl+K)') el.setAttribute('aria-label', 'Search (Ctrl+K)');
		};
		label();
		new MutationObserver((records) => {
			if (records.some((r) => r.addedNodes.length)) label();
		}).observe(document.documentElement, { childList: true, subtree: true });
	}
	let state = 'idle';
	let pending = false;
	let holder: Element | null = null;
	const open = () => (holder?.querySelector('.DocSearch-Button') as HTMLElement | null)?.click();
	const load = () => {
		if (state !== 'idle') return;
		let config: Record<string, unknown> | undefined;
		try {
			config = JSON.parse(document.querySelector(`[${ATTRIBUTE}]`)?.getAttribute(ATTRIBUTE) ?? '');
		} catch {
			return;
		}
		if (!config) return;
		state = 'loading';
		const { src = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3', ...options } = config;
		const script = document.createElement('script');
		script.src = String(src);
		script.onload = () => {
			const made = document.createElement('div');
			made.hidden = true;
			document.documentElement.append(made);
			holder = made;
			w.docsearch?.({ ...options, container: made });
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
	};
	const request = () => {
		if (state === 'ready') open();
		else {
			pending = true;
			load();
		}
	};
	const button = (event: Event) => (event.target instanceof Element ? event.target.closest(`[${ATTRIBUTE}]`) : null);
	for (const type of ['pointerover', 'pointerdown', 'touchstart', 'focusin']) document.addEventListener(type, (event) => (button(event) ? load() : undefined), { capture: true, passive: true });
	document.addEventListener('click', (event) => (button(event) ? request() : undefined), true);
	const editing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName));
	document.addEventListener(
		'keydown',
		(event) => {
			if (state === 'ready' || pending || !document.querySelector(`[${ATTRIBUTE}]`)) return;
			const key = String(event.key).toLowerCase();
			const shortcut = key === 'k' ? event.metaKey || event.ctrlKey : event.key === '/' ? !editing(event.target) : false;
			if (!shortcut) return;
			event.preventDefault();
			request();
		},
		true,
	);
}

/** The head script that runs docsearchOnIntent. */
export const DOCSEARCH_SCRIPT = `(${docsearchOnIntent.toString()})();`;
