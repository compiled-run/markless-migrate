// Alpine.js's binding rules (MIT, Caleb Porzio), as values a Markless binding renders.
const BOOLEAN = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'defer', 'disabled', 'formnovalidate', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected']);
const KEEP_FALSY = new Set(['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-selected']);

export function text(value: unknown): string {
	return value == null ? '' : String(value);
}

export function attr(name: string, value: unknown): string | undefined {
	if ((value === null || value === undefined || value === false) && !KEEP_FALSY.has(name)) return undefined;
	if (BOOLEAN.has(name)) return name;
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	return String(value);
}

const split = (classes: string) => classes.split(/\s/).filter(Boolean);

export function cls(base: string, value: unknown): string {
	const list = split(base);
	if (Array.isArray(value)) value = value.join(' ');
	if (typeof value === 'object' && value !== null) {
		for (const [names, on] of Object.entries(value)) {
			for (const name of split(names)) {
				const at = list.indexOf(name);
				if (on && at === -1) list.push(name);
				if (!on && at !== -1) list.splice(at, 1);
			}
		}
		return list.join(' ');
	}
	const added = value === true ? '' : String(value || '');
	for (const name of split(added)) if (!list.includes(name)) list.push(name);
	return list.join(' ');
}

const kebab = (key: string) => (key.startsWith('--') ? key : key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase());

// A string replaces the whole style attribute (false included, which Alpine writes as "false"); an object sets each property.
export function sty(base: string, value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null) return String(value);
	const declarations = new Map<string, string>();
	for (const part of base.split(';')) {
		const at = part.indexOf(':');
		if (at > 0) declarations.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
	}
	for (const [key, v] of Object.entries(value)) declarations.set(kebab(key), String(v));
	return [...declarations].map(([k, v]) => `${k}: ${v};`).join(' ') || undefined;
}

const undo = new WeakMap<HTMLElement, () => void>();

// The same rules applied straight to an element whose display Alpine's x-show owns.
export function setStyles(el: HTMLElement, value: unknown): void {
	undo.get(el)?.();
	if (typeof value === 'object' && value !== null) {
		const previous: Record<string, string> = {};
		for (const [key, v] of Object.entries(value)) {
			previous[key] = el.style.getPropertyValue(kebab(key));
			el.style.setProperty(kebab(key), String(v));
		}
		undo.set(el, () => {
			for (const [key, v] of Object.entries(previous)) el.style.setProperty(kebab(key), v);
		});
		return;
	}
	const cache = el.getAttribute('style');
	el.setAttribute('style', String(value));
	undo.set(el, () => el.setAttribute('style', cache || ''));
}

/** A property write on an element ($el.textContent = ...), which a Markless element handle does not take directly. */
export function assign(el: Element | undefined, property: string, value: unknown): void {
	if (el) (el as unknown as Record<string, unknown>)[property] = value;
}

/** x-for's iteration: an array by index, an object by key, a number from 1; each row carries the item and its index or key. */
export function rows(items: unknown): { item: unknown; index: number | string }[] {
	if (Array.isArray(items)) return items.map((item, index) => ({ item, index }));
	if (typeof items === 'number') return Array.from({ length: items }, (_, i) => ({ item: i + 1, index: i }));
	return Object.entries((items ?? {}) as object).map(([index, item]) => ({ item, index }));
}
