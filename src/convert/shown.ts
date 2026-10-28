import type { ShownEffect } from './reveal.ts';

/** A listed `show` control of one page: its capture key (signature#nth), where it is from the body, and what using it changed. */
export interface ShownControl {
	readonly key: string;
	readonly path: readonly number[];
	readonly effects: readonly ShownEffect[];
}

/** The page as the capture first showed it, by path from the body: an element's content and attributes. */
export type Baseline = (path: readonly number[]) => { readonly html: string; readonly attr: (name: string) => string | null } | undefined;

const absolute = (control: readonly number[], e: ShownEffect) => [...control.slice(0, control.length - e.up), ...e.down];
const relative = (control: readonly number[], target: readonly number[]): { up: number; down: number[] } => {
	let common = 0;
	while (common < control.length && common < target.length && control[common] === target[common]) common++;
	return { up: control.length - common, down: target.slice(common) };
};

/**
 * Each control's effects made whole: controls whose changes touch one another (a file tree's buttons, each marking itself
 * active and filling the one code view) form a group, and every control of a group sets every place the group changes,
 * from what the page first showed where its own use did not change it (the file already shown changes nothing).
 */
export function completeShown(controls: readonly ShownControl[], baseline: Baseline): Map<string, ShownEffect[]> {
	const parent = controls.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
	const targets = controls.map((c) => new Map(c.effects.map((e) => [absolute(c.path, e).join('.'), e])));
	const owner = new Map<string, number>();
	controls.forEach((c, i) => {
		for (const at of [c.path.join('.'), ...targets[i]!.keys()]) {
			const other = owner.get(at);
			if (other === undefined) owner.set(at, i);
			else parent[find(i)] = find(other);
		}
	});
	const out = new Map<string, ShownEffect[]>();
	const groups = new Map<number, number[]>();
	controls.forEach((_, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i));
	for (const members of groups.values()) {
		const places = new Map<string, { path: number[]; html: boolean; attrs: Set<string> }>();
		for (const i of members)
			for (const e of controls[i]!.effects) {
				const path = absolute(controls[i]!.path, e);
				const place = places.get(path.join('.')) ?? places.set(path.join('.'), { path, html: false, attrs: new Set() }).get(path.join('.'))!;
				if (e.html !== undefined) place.html = true;
				for (const name of Object.keys(e.attrs ?? {})) place.attrs.add(name);
			}
		const order = [...places.values()].sort((a, b) => compare(a.path, b.path));
		for (const i of members) {
			const control = controls[i]!;
			const effects: ShownEffect[] = [];
			for (const place of order) {
				const own = targets[i]!.get(place.path.join('.'));
				const first = baseline(place.path);
				const at = relative(control.path, place.path);
				if (place.html) {
					const html = own?.html ?? first?.html;
					if (html !== undefined) effects.push({ ...at, html });
				}
				if (place.attrs.size && !place.html) {
					const attrs = Object.fromEntries([...place.attrs].sort().map((name) => [name, own?.attrs && name in own.attrs ? own.attrs[name]! : (first?.attr(name) ?? null)]));
					effects.push({ ...at, attrs });
				}
			}
			out.set(control.key, effects);
		}
	}
	return out;
}

function compare(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return a.length - b.length;
}
