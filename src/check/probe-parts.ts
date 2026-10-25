import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Attributes every library uses alike say nothing about which part drives an element.
const GENERIC = /^(role|aria-[\w-]+|tabindex|hidden|type|disabled|href|id|open|class|style|name|value|for|inert|popover|contenteditable)$/;

export interface PartSelectors {
	readonly file: string;
	readonly selectors: readonly string[];
}

let cached: Promise<PartSelectors[]> | undefined;

/** The CSS selectors each converter part (parts/**) claims its markup by, from the string constants in its source. */
export function partSelectors(root = ROOT): Promise<PartSelectors[]> {
	if (root === ROOT && cached) return cached;
	const found = collect(root);
	if (root === ROOT) cached = found;
	return found;
}

async function collect(root: string): Promise<PartSelectors[]> {
	const files = await walk(join(root, 'parts')).catch(() => [] as string[]);
	const out: PartSelectors[] = [];
	for (const file of files.sort()) {
		const source = await readFile(file, 'utf8').catch(() => '');
		const selectors = new Set<string>();
		for (const m of source.matchAll(/(['"`])((?:(?!\1)[^\\\n])*\[[^\n]*?)\1/g)) {
			const text = m[2]!;
			if (text.includes('${') || text.length > 400) continue;
			for (const alternative of alternatives(text)) {
				const positive = alternative.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
				if ([...positive.matchAll(/\[\s*([\w-]+)/g)].some((a) => !GENERIC.test(a[1]!))) selectors.add(alternative.trim());
			}
		}
		if (selectors.size) out.push({ file: relative(root, file), selectors: [...selectors] });
	}
	return out;
}

/** A selector list's alternatives, split at its top-level commas. */
function alternatives(list: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		else if (c === ',' && depth === 0) {
			out.push(list.slice(start, i));
			start = i + 1;
		}
	}
	out.push(list.slice(start));
	return out;
}

async function walk(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(path)));
		else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(path);
	}
	return out;
}

/** Runs in the page: the part files whose selectors match the probed control, what holds it, or what is open, most matches first. */
export function matchParts(parts: readonly PartSelectors[]): string[] {
	const control = document.querySelector('[data-markless-migrate-probe]');
	const open = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [popover]')].filter((p) => p.checkVisibility());
	const subjects: Element[] = [];
	for (let at: Element | null = control, n = 0; at && at !== document.body && n < 4; at = at.parentElement, n++) subjects.push(at);
	subjects.push(...open);
	const scored: { file: string; score: number }[] = [];
	for (const part of parts) {
		let score = 0;
		for (const selector of part.selectors) {
			try {
				if (subjects.some((s) => s.matches(selector))) score++;
			} catch {}
		}
		if (score) scored.push({ file: part.file, score });
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.file);
}
