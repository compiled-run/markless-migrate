// The live code blocks of theme-live-codeblock: the importer leaves each one's code on its container, read here
// before site.ts takes the data-mm-* hints off the page; the editor and preview code loads only where one exists.
export type LiveHint = { code: string; compiled: string; noInline: boolean; language: string };

// Built apart from the app (lazy.config.ts), so pages without a playground do not preload it.
const RUNTIME = '/lazy/playground-runtime.js';
let runtime: Promise<typeof import('./playground-runtime.ts')> | undefined;

export function preloadPlaygrounds(): void {
	runtime ??= import(/* @vite-ignore */ RUNTIME) as Promise<typeof import('./playground-runtime.ts')>;
}

export function initPlaygrounds(): void {
	const found: [HTMLElement, LiveHint][] = [];
	for (const el of document.querySelectorAll<HTMLElement>('[data-mm-live]')) {
		found.push([el, JSON.parse(el.getAttribute('data-mm-live')!) as LiveHint]);
		el.removeAttribute('data-mm-live');
	}
	if (!found.length && !runtime) return;
	runtime ??= import(/* @vite-ignore */ RUNTIME) as Promise<typeof import('./playground-runtime.ts')>;
	void runtime.then((live) => {
		live.sweep();
		for (const [el, hint] of found) live.mount(el, hint);
	});
}
