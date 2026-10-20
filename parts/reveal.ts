// What the old page's library mounted on use was captured from it into inert templates; these put it in place and take it out.

export function templatesFor(key: string): HTMLTemplateElement[] {
	return [...document.querySelectorAll<HTMLTemplateElement>(`template[data-mm-reveal="${CSS.escape(key)}"]`)];
}

/** Clones a revealed subtree into its place: the body for content a library portals there, else the template's own parent. */
export function mount(template: HTMLTemplateElement): Element[] {
	const into = template.dataset.mmInto === 'body' ? document.body : template.parentElement;
	if (!into) return [];
	const nodes = [...template.content.cloneNode(true).childNodes].filter((n): n is Element => n instanceof Element);
	const before = Number(template.dataset.mmBefore ?? '-1');
	const siblings = [...into.children].filter((c) => c.tagName !== 'TEMPLATE');
	const anchor = before >= 0 ? siblings[before] ?? null : null;
	for (const node of nodes) into.insertBefore(node, anchor);
	return nodes;
}

/** Mounts every template of a control; returns what it mounted. */
export function reveal(key: string): Element[] {
	return templatesFor(key).flatMap((t) => mount(t));
}

/** Removes a container's mounted content, keeping its templates. */
export function unmountIn(container: Element): void {
	for (const child of [...container.childNodes]) if (!(child instanceof HTMLTemplateElement)) child.remove();
}

/** Mounts the templates inside a container once (content a library renders only while the container is shown). */
export function mountIn(container: Element): void {
	if ([...container.childNodes].some((n) => !(n instanceof HTMLTemplateElement) && !(n instanceof Text && !n.data.trim()))) return;
	for (const template of container.querySelectorAll<HTMLTemplateElement>(':scope > template[data-mm-reveal]')) mount(template);
}

/** A control that took itself away on the old page: its container gets what the old page then showed. */
export function replaceFrom(target: Element): boolean {
	const template = [...target.querySelectorAll<HTMLTemplateElement>('template[data-mm-into="replace"]')].find((t) => t.parentElement && t.parentElement.closest('button, a, [role="button"]') === t.parentElement.closest('button, a, [role="button"]'));
	const control = template?.parentElement?.closest('button, a, [role="button"]') ?? null;
	if (!template || !control || !control.contains(target) && control !== target) return false;
	let container: Element | null = control;
	for (let depth = Number(template.dataset.mmBefore ?? '1'); depth > 0 && container; depth--) container = container.parentElement;
	if (!container) return false;
	container.replaceChildren(template.content.cloneNode(true));
	return true;
}
