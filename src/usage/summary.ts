import { isCheckable, MECHANISMS } from './obligations.ts';
import type { Behaviour, Coverage, Implementation, Obligation, UsageInventory } from './types.ts';

/** A behaviour is checked when every obligation it has is one this checker performs. */
export function coverage(inventory: Pick<UsageInventory, 'behaviours' | 'obligations'>, implemented: readonly Implementation[]): Coverage {
	const done = new Set(implemented.filter((i) => i.status === 'implemented').map((i) => i.behaviour));
	const byBehaviour = new Map<string, Obligation[]>();
	for (const o of inventory.obligations) byBehaviour.set(o.behaviour, [...(byBehaviour.get(o.behaviour) ?? []), o]);
	const checked = (b: Behaviour) => (byBehaviour.get(b.id) ?? []).every(isCheckable);
	const libraries = new Map<string, { used: number; implemented: number; checked: number }>();
	for (const b of inventory.behaviours) {
		const l = libraries.get(b.library) ?? { used: 0, implemented: 0, checked: 0 };
		l.used++;
		if (done.has(b.id)) l.implemented++;
		if (checked(b)) l.checked++;
		libraries.set(b.library, l);
	}
	return {
		used: inventory.behaviours.length,
		implemented: inventory.behaviours.filter((b) => done.has(b.id)).length,
		checked: inventory.behaviours.filter(checked).length,
		obligations: { total: inventory.obligations.length, checkable: inventory.obligations.filter(isCheckable).length },
		byLibrary: [...libraries].map(([library, l]) => ({ library, ...l })).sort((a, b) => b.used - a.used || a.library.localeCompare(b.library)),
	};
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '-');

/** The plan and run account of the usage inventory: what the old site uses, what the port implements, what check proves. */
export function summarizeUsage(inventory: UsageInventory, implemented: readonly Implementation[], detail = 8): string {
	const c = coverage(inventory, implemented);
	const lines = [
		`Browser behaviour the old site uses: ${c.used} behaviours on ${inventory.pages} pages, read from each page's markup, the syntax tree of every script it runs${inventory.source ? ', its theme config and its library usage' : ''}.`,
		`  used ${c.used} / implemented in Markless ${c.implemented} (${pct(c.implemented, c.used)}) / checked ${c.checked} (${pct(c.checked, c.used)}); ${c.obligations.total} check obligations, ${c.obligations.checkable} of them performed by this checker`,
	];
	const runtimes = inventory.scripts.filter((s) => s.runtime && !/^(kept library|library|third-party)/.test(s.runtime));
	if (runtimes.length) lines.push(`  Runtimes the old pages load, none of which the port may ship (what the pages use of them is listed below): ${[...new Set(runtimes.map((s) => s.runtime))].join(', ')}`);
	const kept = inventory.scripts.filter((s) => s.runtime?.startsWith('kept library '));
	if (kept.length) lines.push(`  Kept libraries (JavaScript only, kept as they are; the upgrade step measures them after the migration): ${[...new Set(kept.map((s) => s.runtime!.slice('kept library '.length)))].join(', ')}`);
	const others = inventory.scripts.filter((s) => s.runtime?.startsWith('third-party '));
	if (others.length) lines.push(`  Other sites' scripts (embeds): ${[...new Set(others.map((s) => s.runtime!.slice('third-party '.length)))].join(', ')}`);
	for (const l of c.byLibrary.slice(0, 16)) lines.push(`  ${l.library.padEnd(28)} used ${String(l.used).padStart(3)}  implemented ${String(l.implemented).padStart(3)}  checked ${String(l.checked).padStart(3)}`);
	if (c.byLibrary.length > 16) lines.push(`  ... ${c.byLibrary.length - 16} more libraries in usage.json`);
	const missing = new Map(implemented.filter((i) => i.status === 'unimplemented').map((i) => [i.behaviour, i]));
	const wanted = inventory.behaviours.filter((b) => missing.has(b.id)).sort((a, b) => b.routes.length - a.routes.length);
	if (wanted.length) {
		lines.push(`  Not implemented yet (most routes first):`);
		for (const b of wanted.slice(0, detail)) lines.push(`    ${b.id} (${b.routes.length} route${b.routes.length === 1 ? '' : 's'}): ${b.summary}${missing.get(b.id)?.suggestion ? ` -> ${missing.get(b.id)!.suggestion}` : ''}`);
		if (wanted.length > detail) lines.push(`    ... ${wanted.length - detail} more in usage.json`);
	}
	const unavailable = Object.entries(MECHANISMS).filter(([m, v]) => !v.available && inventory.obligations.some((o) => o.mechanism === m));
	if (unavailable.length) lines.push(`  Obligations this checker does not perform yet, so their behaviours count as unchecked: ${unavailable.map(([m]) => `${m} (${inventory.obligations.filter((o) => o.mechanism === m).length})`).join(', ')}`);
	for (const limit of inventory.limits.slice(0, 6)) lines.push(`  Limit: ${limit}`);
	if (inventory.limits.length > 6) lines.push(`  ... ${inventory.limits.length - 6} more limits in usage.json`);
	return `${lines.join('\n')}\n`;
}

/** What the run's prompt tells the agent about one route: each behaviour it must implement and the checks that will hold it to it. */
export function routeBrief(inventory: UsageInventory, implemented: readonly Implementation[], route: string, limit = 25): string | undefined {
	const here = inventory.behaviours.filter((b) => b.routes.includes(route));
	if (!here.length) return undefined;
	const status = new Map(implemented.map((i) => [i.behaviour, i]));
	const lines = [`What route ${route} uses in the browser (from .migrate/usage.json). Implement every one in Markless; never load the old runtime:`];
	for (const b of here.slice(0, limit)) {
		const s = status.get(b.id);
		const obligations = inventory.obligations.filter((o) => o.behaviour === b.id);
		lines.push(`- [${s?.status === 'implemented' ? `implemented by ${s.by}` : 'not implemented'}] ${b.id}: ${b.summary}${s?.status !== 'implemented' && s?.suggestion ? ` (use ${s.suggestion})` : ''}`);
		for (const o of obligations) lines.push(`    check: ${o.text}${isCheckable(o) ? '' : ' (not performed by this checker yet: make it hold anyway)'}`);
	}
	if (here.length > limit) lines.push(`- ... ${here.length - limit} more on this route in .migrate/usage.json`);
	lines.push(`When you implement one, record where in .migrate/usage-map.json: { "<behaviour id>": { "by": "<file in the new app>" } } (or "by": "@markless/ui <family>" for a shared part).`);
	return lines.join('\n');
}
