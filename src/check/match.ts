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

const sameBox = (x: ElementSnapshot, y: ElementSnapshot) => Math.abs(x.box.x - y.box.x) <= 2 && Math.abs(x.box.width - y.box.width) <= 2 && Math.abs(x.box.height - y.box.height) <= 2;

const sameStyle = (x: ElementSnapshot, y: ElementSnapshot) => {
	const keys = Object.keys(x.style);
	return keys.length === Object.keys(y.style).length && keys.every((k) => x.style[k] === y.style[k]);
};

// Of two elements in one box (a row and its only child), the one styled the same is the counterpart.
const score = (x: ElementSnapshot, y: ElementSnapshot) => (sameBox(x, y) ? (sameStyle(x, y) ? 2 : 1) : 0);

// In order, but skipping what has no counterpart: elements whose boxes match (x, width and height; content above may move y) pair first, the rest by position among themselves.
function pairInGroup(a: readonly ElementSnapshot[], b: readonly ElementSnapshot[], groupA: readonly number[], groupB: readonly number[]): [number, number][] {
	const cols = groupB.length + 1;
	const table = new Uint32Array((groupA.length + 1) * cols);
	for (let i = groupA.length - 1; i >= 0; i--) {
		for (let j = groupB.length - 1; j >= 0; j--) {
			const s = score(a[groupA[i]!]!, b[groupB[j]!]!);
			const hit = s ? table[(i + 1) * cols + j + 1]! + s : 0;
			table[i * cols + j] = Math.max(hit, table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
		}
	}
	const out: [number, number][] = [];
	const leftA: number[] = [];
	const leftB = new Set(groupB);
	let i = 0;
	let j = 0;
	while (i < groupA.length && j < groupB.length) {
		const s = score(a[groupA[i]!]!, b[groupB[j]!]!);
		if (s && table[i * cols + j] === table[(i + 1) * cols + j + 1]! + s) {
			out.push([groupA[i]!, groupB[j]!]);
			leftB.delete(groupB[j]!);
			i++;
			j++;
		} else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) leftA.push(groupA[i++]!);
		else j++;
	}
	while (i < groupA.length) leftA.push(groupA[i++]!);
	const restB = [...leftB];
	for (let n = 0; n < Math.min(leftA.length, restB.length); n++) out.push([leftA[n]!, restB[n]!]);
	return out;
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
			for (const [i, j] of pairInGroup(a, b, groupA, groupB)) {
				pairs.set(i, j);
				usedB.add(j);
			}
		}
	}
	return pairs;
}

export function describe(el: ElementSnapshot): string {
	const label = el.name || el.text;
	return `${el.role || el.tag}${label ? ` "${label.length > 50 ? `${label.slice(0, 50)}...` : label}"` : ''} (${el.path})`;
}
