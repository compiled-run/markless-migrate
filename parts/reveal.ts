// What the old page showed on use is rendered by Markless, hidden: a portal at the end of the body marked with its
// control's key (data-mm-layer), and the content a control replaces its container's with (data-mm-after). Parts only
// switch attributes on those nodes; they never insert or remove one, except a large layer's: the page carries its shell
// in a <template data-mm-layer-src> and fetches the file holding the rest as it loads. On use the shell is mounted at the
// end of the body, after the page, and its emptied element (data-mm-layer-fill) takes the file's content when it is in.

const LAYER_SOURCE = 'template[data-mm-layer-src]';
const fetched = new Map<string, Promise<string>>();
const markup = new Map<string, string>();

function request(src: string): Promise<string> {
	let pending = fetched.get(src);
	if (!pending) {
		pending = fetch(src).then((response) => (response.ok ? response.text() : Promise.reject(new Error(`${src}: ${response.status}`))));
		fetched.set(src, pending);
		pending.then((html) => markup.set(src, html), () => fetched.delete(src));
	}
	return pending;
}

/** Fills a mounted shell once its file is in; a field typed into meanwhile is read again. */
function fill(template: HTMLTemplateElement): void {
	const src = template.dataset.mmLayerSrc!;
	const html = markup.get(src);
	const into = document.querySelector<HTMLElement>(`[data-mm-layer-fill="${CSS.escape(src)}"]`);
	if (html === undefined || !into) return;
	into.removeAttribute('data-mm-layer-fill');
	const range = document.createRange();
	range.selectNodeContents(into);
	afterPage(range.createContextualFragment(html.split('@@MM_APP_URL@@').join(template.dataset.mmAppUrl ?? '')), into);
	const root = into.closest('[data-mm-layer]');
	for (const field of root?.querySelectorAll<HTMLInputElement>('input, textarea') ?? []) if (field.value) field.dispatchEvent(new Event('input', { bubbles: true }));
}

// The old origin a served layer names, given as a token in the page's shell and in the file: the new one in its place.
function withOrigin(nodes: DocumentFragment, origin: string): DocumentFragment {
	const token = '@@MM_APP_URL@@';
	const walker = document.createTreeWalker(nodes, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.TEXT_NODE) {
			if (node.nodeValue?.includes(token)) node.nodeValue = node.nodeValue.split(token).join(origin);
		} else for (const attribute of (node as Element).attributes) if (attribute.value.includes(token)) attribute.value = attribute.value.split(token).join(origin);
	}
	return nodes;
}

/** Mounts a served layer's shell, unless it is in already, and fills it if its file is. */
function mountServed(template: HTMLTemplateElement): void {
	const keys = (template.dataset.mmLayerKeys ?? '').split(' ').filter(Boolean);
	if (!keys.some((key) => document.querySelector(`[data-mm-layer="${CSS.escape(key)}"]`))) afterPage(withOrigin(template.content.cloneNode(true) as DocumentFragment, template.dataset.mmAppUrl ?? ''));
	fill(template);
	void request(template.dataset.mmLayerSrc!).then(() => template.isConnected && fill(template), () => {});
}

// The end of the body follows the page's end comment, where Markless counts nothing: the document's own nodes, and a
// shell mounted there.
function afterPage(nodes: DocumentFragment, into: Element = document.body): void {
	into.append(nodes);
}

/** Fetches the files of the page's served layers not fetched yet, and fills any shell already mounted. */
export function loadLayers(): Promise<void> {
	const pending: Promise<unknown>[] = [];
	for (const template of document.querySelectorAll<HTMLTemplateElement>(LAYER_SOURCE))
		pending.push(request(template.dataset.mmLayerSrc!).then(() => template.isConnected && fill(template), () => {}));
	return Promise.all(pending).then(() => {});
}

/** Whether the page names a served layer whose file is not in yet. */
export const layersPending = (): boolean => [...document.querySelectorAll<HTMLTemplateElement>(LAYER_SOURCE)].some((t) => !markup.has(t.dataset.mmLayerSrc!));

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
