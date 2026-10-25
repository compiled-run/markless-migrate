import { createHash } from 'node:crypto';
import { attr, outer, walk, type Element } from './dom.ts';
import { GENERATED_ID } from './factor.ts';

export interface CapturedLayer {
	readonly key: string;
	readonly kept: readonly Element[];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8);

/**
 * The ids a framework generated per render inside a layer (Radix's and React's useId), and the layer's key when it is
 * one, given names from the layer's own content: the same dialog on two pages differs only by those ids, and is then
 * one layer component instead of one per page.
 */
export function layerIds(key: string, kept: readonly Element[]): Map<string, string> {
	const own: string[] = [];
	for (const top of kept)
		for (const el of walk(top)) {
			const id = attr(el, 'id');
			if (id && GENERATED_ID.test(id) && !own.includes(id)) own.push(id);
		}
	if (GENERATED_ID.test(key) && !own.includes(key)) own.push(key);
	if (!own.length) return new Map();
	let text = kept.map((e) => outer(e)).join('');
	own.forEach((id, k) => (text = text.split(id).join(`@${k}`)));
	const h = hash(text);
	return new Map(own.map((id, k) => [id, `mm-${h}-${k}`]));
}

/**
 * The new names of a page's layers' generated ids: `each[i]` for what layer `i` holds, `page` for what the page holds.
 * Layers captured on separate loads share React's client ids (its counter starts over on each load), so a layer
 * names another's id only along the menus it was captured with: the layer holding its key (an element with that id
 * or data-mm-key: the menu a submenu opens from) and the layers keyed by ids it holds. A layer with no trigger in the
 * page and no such menu names any layer's id, the first to hold it.
 */
export function layerNames(layers: readonly (CapturedLayer & { readonly inPage: boolean })[]): { page: Map<string, string>; each: Map<string, string>[] } {
	const own = new Map<string, Map<string, string>>();
	const taken = new Set<string>();
	for (const l of layers) {
		const mine = own.get(l.key) ?? own.set(l.key, new Map()).get(l.key)!;
		for (const [from, to] of layerIds(l.key, l.kept)) {
			if (mine.has(from)) continue;
			let name = to;
			for (let n = 2; taken.has(name); n++) name = `${to}-${n}`;
			taken.add(name);
			mine.set(from, name);
		}
	}
	const page = new Map<string, string>();
	for (const names of own.values()) for (const [from, to] of names) if (!page.has(from)) page.set(from, to);
	const keys = new Map<string, string>();
	for (const [key, names] of own) if (names.has(key)) keys.set(key, names.get(key)!);
	const opener = new Map<string, string>();
	for (const l of layers)
		for (const top of l.kept)
			for (const el of walk(top))
				for (const named of [attr(el, 'id'), attr(el, 'data-mm-key')]) if (named && named !== l.key && own.has(named) && !opener.has(named)) opener.set(named, l.key);
	const chain = (key: string) => {
		const out: string[] = [];
		for (let at = opener.get(key); at !== undefined && at !== key && !out.includes(at); at = opener.get(at)) out.push(at);
		return out;
	};
	const each = layers.map((l) => {
		const up = chain(l.key);
		const down = [...own.keys()].filter((k) => k !== l.key && chain(k).includes(l.key));
		const loose = !l.inPage && !up.length ? [page] : [];
		return new Map([...loose.flatMap((m) => [...m]), ...keys, ...down.flatMap((k) => [...own.get(k)!]), ...up.reverse().flatMap((k) => [...own.get(k)!]), ...own.get(l.key)!]);
	});
	return { page, each };
}
