import type { ElementSnapshot } from './types.ts';

type KeyFn = (el: ElementSnapshot) => string | undefined;

const KEYS: readonly KeyFn[] = [
	// Nameless, textless elements (wrapper divs) pair by landmark path: one extra wrapper must not shift every pair after it.
	(el) => (el.name || el.text ? `${el.role}|${el.name}|${el.tag}|${el.text}` : undefined),
	(el) => el.path,
	(el) => `${el.role}|${el.name}|${el.tag}`,
];

function keyed(elements: readonly ElementSnapshot[], indices: readonly number[], key: KeyFn): Map<string, number[]> {
	const groups = new Map<string, number[]>();
	for (const i of indices) {
		const k = key(elements[i]!);
		if (k === undefined) continue;
		const group = groups.get(k);
		if (group) group.push(i);
		else groups.set(k, [i]);
	}
	return groups;
}

// Pairs elements by accessible role, name and text first, then by landmark path, never by class name.
export function matchElements(a: readonly ElementSnapshot[], b: readonly ElementSnapshot[]): Map<number, number> {
	const pairs = new Map<number, number>();
	const usedB = new Set<number>();
	for (const key of KEYS) {
		const restA = a.map((_, i) => i).filter((i) => !pairs.has(i));
		const restB = b.map((_, i) => i).filter((i) => !usedB.has(i));
		const groupsB = keyed(b, restB, key);
		for (const [k, groupA] of keyed(a, restA, key)) {
			const groupB = groupsB.get(k);
			if (!groupB) continue;
			for (let n = 0; n < Math.min(groupA.length, groupB.length); n++) {
				pairs.set(groupA[n]!, groupB[n]!);
				usedB.add(groupB[n]!);
			}
		}
	}
	return pairs;
}

export function describe(el: ElementSnapshot): string {
	const label = el.name || el.text;
	return `${el.role || el.tag}${label ? ` "${label.length > 50 ? `${label.slice(0, 50)}...` : label}"` : ''} (${el.path})`;
}
