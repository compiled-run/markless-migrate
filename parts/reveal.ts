// What the old page showed on use is rendered by Markless, hidden: a portal at the end of the body marked with its
// control's key (data-mm-layer), and the content a control replaces its container's with (data-mm-after). Parts only
// switch attributes on those nodes; they never insert or remove one, except a large layer's: the page carries a
// <template data-mm-layer-src> naming its HTML file, and its nodes are mounted at the end of the body, after the page,
// once the page is idle or the layer is first used, as the old page mounted it on use.

const LAYER_SOURCE = 'template[data-mm-layer-src]';
const fetched = new Map<string, Promise<string>>();
const markup = new Map<string, string>();

function mountServed(template: HTMLTemplateElement): boolean {
	const html = markup.get(template.dataset.mmLayerSrc!);
	if (html === undefined) return false;
	const keys = (template.dataset.mmLayerKeys ?? '').split(' ').filter(Boolean);
	if (keys.some((key) => document.querySelector(`[data-mm-layer="${CSS.escape(key)}"]`))) return true;
	const range = document.createRange();
	range.selectNodeContents(document.body);
	afterPage(range.createContextualFragment(html.split('@@MM_APP_URL@@').join(template.dataset.mmAppUrl ?? '')));
	return true;
}

// The end of the body follows the page's end comment, where Markless counts nothing: the document's own nodes.
function afterPage(nodes: DocumentFragment): void {
	document.body.append(nodes);
}

/** Fetches the page's served layers not yet here and mounts them; resolves once every one is in. */
export function loadLayers(): Promise<void> {
	const pending: Promise<unknown>[] = [];
	for (const template of document.querySelectorAll<HTMLTemplateElement>(LAYER_SOURCE)) {
		if (mountServed(template)) continue;
		const src = template.dataset.mmLayerSrc!;
		let request = fetched.get(src);
		if (!request) {
			request = fetch(src).then((response) => (response.ok ? response.text() : Promise.reject(new Error(`${src}: ${response.status}`))));
			fetched.set(src, request);
			request.then((html) => markup.set(src, html), () => fetched.delete(src));
		}
		pending.push(request.then(() => template.isConnected && mountServed(template), () => {}));
	}
	return Promise.all(pending).then(() => {});
}

/** Whether the page names a served layer whose nodes are not mounted yet. */
export const layersPending = (): boolean => [...document.querySelectorAll<HTMLTemplateElement>(LAYER_SOURCE)].some((t) => !mountServed(t));

/** The nodes a control portals, for this viewport when the page has a variant of its own for it. */
export function layersFor(key: string): HTMLElement[] {
	const served = document.querySelector<HTMLTemplateElement>(`${LAYER_SOURCE}[data-mm-layer-keys~="${CSS.escape(key)}"]`);
	if (served) mountServed(served);
	const all = [...document.querySelectorAll<HTMLElement>(`[data-mm-layer="${CSS.escape(key)}"]`)];
	const mobile = matchMedia('(max-width: 767px)').matches;
	const own = all.filter((n) => (n.dataset.mmViewport === 'mobile') === mobile);
	return own.length ? own : all.filter((n) => !n.dataset.mmViewport);
}

/** A control that took itself away on the old page (View Code): its container's content switches to what it then showed. */
export function swap(control: Element): boolean {
	const key = control.getAttribute('data-mm-replace');
	if (!key) return false;
	const container = control.closest(`:has(> [data-mm-after="${CSS.escape(key)}"])`);
	if (!container) return false;
	for (const el of container.querySelectorAll<HTMLElement>(`:scope > [data-mm-before="${CSS.escape(key)}"]`)) el.hidden = true;
	for (const el of container.querySelectorAll<HTMLElement>(`:scope > [data-mm-after="${CSS.escape(key)}"]`)) el.hidden = false;
	return true;
}

// The capture's signature of a control: its tag, data-slot and text, and which element with them it is in document order.
function signature(el: Element): string {
	return `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
}

/** What a copy control wrote on the old page, from the page's own template; undefined for a control that copied nothing. */
export function clipboardFor(control: Element): Promise<string> | undefined {
	const sig = signature(control);
	let nth = 0;
	for (const el of document.body.querySelectorAll('*')) {
		if (el === control) break;
		if (signature(el) === sig) nth++;
	}
	const copied = document.querySelector<HTMLTemplateElement>(`template[data-mm-clipboard="${CSS.escape(`${sig}#${nth}`)}"]`);
	return copied ? Promise.resolve(copied.getAttribute('data-mm-text') ?? '') : undefined;
}
