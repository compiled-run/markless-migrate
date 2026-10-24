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

export const ATTRIBUTE = 'data-mm-docsearch';
/** On a DocSearch button, what it says off Apple platforms: {"label":…,"shortcut":…}; DocSearch 3's wording when absent. */
export const KEYS_ATTRIBUTE = 'data-mm-docsearch-keys';
const CTRL_ICON = '<svg width="15" height="15" class="DocSearch-Control-Key-Icon"><path d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953" stroke-width="1.2" stroke="currentColor" fill="none" stroke-linecap="square"></path></svg>';
/** DocSearch's button off Apple platforms, by major version: its name, its aria-keyshortcuts and its Ctrl key. */
export const CTRL_KEYS = {
	3: { label: 'Search (Ctrl+K)', shortcut: undefined, key: `<kbd class="DocSearch-Button-Key" data-mm-key="ctrl">${CTRL_ICON}</kbd>` },
	4: { label: 'Search (Control+k)', shortcut: 'Control+k', key: '<kbd class="DocSearch-Button-Key DocSearch-Button-Key--ctrl" data-mm-key="ctrl">Ctrl</kbd>' },
} as const;
export const APPLE_KEY = '<kbd class="DocSearch-Button-Key" data-mm-key="apple">⌘</kbd>';
/** A <script type="text/html"> holding DocSearch's dialog as it first draws it, captured from the old site by plan. */
export const SHELL_ATTRIBUTE = 'data-mm-docsearch-shell';

/** The shell's markup as page text: a script element's content may not close the element. */
export function shellScript(html: string): string {
	return html.replace(/<\/(script)/gi, '<\\/$1');
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
	// A button the part runs (data-mm-docsearch) or one whose page runs its own dialog and only shows its keys (data-mm-docsearch-keys).
	const buttons = '[data-mm-docsearch],[data-mm-docsearch-keys]';
	const style = document.createElement('style');
	// DocSearch 4 spaces its first key with :first-child, which the hidden ⌘ key still is off Apple platforms.
	style.append(`:is(${buttons}) [data-mm-key="${apple ? 'ctrl' : 'apple'}"]{display:none}`, apple ? '' : `:is(${buttons}) [data-mm-key="apple"]+[data-mm-key="ctrl"]{margin-inline-end:.4em}`);
	document.head.append(style);
	// An in-place navigation replaces the head, and the next page's copy of this script stops at the flag above.
	new MutationObserver(() => {
		if (!style.isConnected) document.head.append(style);
	}).observe(document.documentElement, { childList: true, subtree: true });
	if (!apple) {
		const label = () => {
			for (const el of document.querySelectorAll(buttons)) {
				let keys: { label?: string; shortcut?: string } = {};
				try {
					keys = JSON.parse(el.getAttribute('data-mm-docsearch-keys') ?? '{}');
				} catch {}
				const name = keys.label ?? 'Search (Ctrl+K)';
				if (el.getAttribute('aria-label') !== name) el.setAttribute('aria-label', name);
				if (keys.shortcut && el.getAttribute('aria-keyshortcuts') !== keys.shortcut) el.setAttribute('aria-keyshortcuts', keys.shortcut);
			}
		};
		label();
		// A button an in-place navigation brings in, or one it keeps and rewrites (a morph sets the server's name again).
		new MutationObserver((records) => {
			if (records.some((r) => r.addedNodes.length || r.type === 'attributes')) label();
		}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-keyshortcuts'] });
	}
	let state = 'idle';
	let pending = false;
	let holder: Element | null = null;
	// DocSearch's dialog as it first draws it, shown on a press made before its script is in: the visitor sees and types
	// into the same dialog at once, and DocSearch takes over with the query and the focus when it arrives.
	let shell: HTMLElement | null = null;
	// Drawn after <body>, outside the page Markless renders; DocSearch's styles key off the classes, not the place.
	const layer = document.createElement('div');
	const closeShell = () => {
		if (!shell) return;
		layer.replaceChildren();
		layer.remove();
		shell = null;
		pending = false;
		document.body.classList.remove('DocSearch--active');
	};
	const showShell = () => {
		const source = document.querySelector('script[data-mm-docsearch-shell]');
		if (shell || !source?.textContent) return;
		const made = document.createRange().createContextualFragment(source.textContent).firstElementChild as HTMLElement | null;
		if (!made) return;
		made.querySelector<HTMLElement>('.DocSearch-Modal')?.style.setProperty('--docsearch-vh', `${window.innerHeight * 0.01}px`);
		layer.replaceChildren(made);
		document.documentElement.append(layer);
		document.body.classList.add('DocSearch--active');
		shell = made;
		made.querySelector<HTMLInputElement>('.DocSearch-Input')?.focus();
		made.addEventListener('click', (event) => {
			const target = event.target as Element;
			if (target === made || target.closest('.DocSearch-Cancel')) closeShell();
		});
		made.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') closeShell();
		});
		made.querySelector('form')?.addEventListener('submit', (event) => event.preventDefault());
	};
	// DocSearch draws its own dialog beside the shell; the query, caret and focus move to it, then the shell goes.
	const handOver = () => {
		const from = shell;
		if (!from) return;
		const query = from.querySelector<HTMLInputElement>('.DocSearch-Input')?.value ?? '';
		const take = () => {
			const into = [...document.querySelectorAll<HTMLElement>('.DocSearch-Container')].find((el) => el !== from);
			const input = into?.querySelector<HTMLInputElement>('.DocSearch-Input');
			if (!into || !input) return false;
			if (query) {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, query);
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}
			input.focus();
			input.setSelectionRange(query.length, query.length);
			layer.replaceChildren();
			layer.remove();
			if (shell === from) shell = null;
			return true;
		};
		if (take()) return;
		const watch = new MutationObserver(() => {
			if (take()) watch.disconnect();
		});
		watch.observe(document.body, { childList: true, subtree: true });
	};
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
				handOver();
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
			showShell();
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
