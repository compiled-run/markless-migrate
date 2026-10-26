// The migration order plan writes (dependencies first; among ready ones layouts, then the most depended-on, then by id):
// the same order as choosing among every ready component again after each step, on graphs with cycles, shared
// dependents and ids collation ranks alike, in a time that grows with the graph and not its square.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { planOrder } from '../src/source/components.ts';
import type { Component } from '../src/source/types.ts';

// The order as first written: every step sorts all ready components again and counts dependents by walking them.
function reference(facts: { components: readonly Component[] }) {
	const byId = new Map(facts.components.map((c) => [c.id, c]));
	const dependents = new Map<string, number>();
	const count = (id: string) => {
		if (dependents.has(id)) return dependents.get(id)!;
		dependents.set(id, 0);
		const seen = new Set<string>();
		const queue = [...(byId.get(id)?.usedBy ?? [])];
		while (queue.length) {
			const next = queue.pop()!;
			if (seen.has(next) || next === id) continue;
			seen.add(next);
			queue.push(...(byId.get(next)?.usedBy ?? []));
		}
		dependents.set(id, seen.size);
		return seen.size;
	};
	const remaining = new Map(facts.components.map((c) => [c.id, new Set(c.uses.filter((u) => byId.has(u) && u !== c.id))]));
	const rank = { layout: 0, component: 1, route: 2 } as const;
	const order: { kind: string; id: string; name: string; file: string; unlocks: number }[] = [];
	const better = (a: Component, b: Component) => rank[a.kind] - rank[b.kind] || count(b.id) - count(a.id) || a.id.localeCompare(b.id);
	while (remaining.size) {
		let ready = [...remaining].filter(([, deps]) => deps.size === 0).map(([id]) => byId.get(id)!);
		if (!ready.length) ready = [[...remaining].sort(([a, x], [b, y]) => x.size - y.size || a.localeCompare(b))[0]!].map(([id]) => byId.get(id)!);
		const next = ready.sort(better)[0]!;
		order.push({ kind: next.kind, id: next.id, name: next.name, file: next.file, unlocks: count(next.id) });
		remaining.delete(next.id);
		for (const deps of remaining.values()) deps.delete(next.id);
	}
	return order;
}

// Ids that collation ranks alike or apart from code points (case, accents), and some not in the graph.
const NAMES = ['a', 'A', 'b', 'é', 'e', 'ß', 'ss', 'Nav', 'nav', 'x1', 'x10', 'x2', '', 'Z'];
const graph = fc
	.record({
		size: fc.integer({ min: 1, max: 40 }),
		names: fc.array(fc.constantFrom(...NAMES), { minLength: 40, maxLength: 40 }),
		kinds: fc.array(fc.constantFrom('component', 'layout', 'route') as fc.Arbitrary<Component['kind']>, { minLength: 40, maxLength: 40 }),
		edges: fc.array(fc.tuple(fc.nat(44), fc.nat(44)), { maxLength: 120 }),
	})
	.map(({ size, names, kinds, edges }): Component[] => {
		const ids = Array.from({ length: size }, (_, i) => `${names[i]}#${i % 7 === 3 ? names[(i + 1) % 40] : i}`);
		const uniq = [...new Set(ids)];
		const idOf = (n: number) => (n < uniq.length ? uniq[n]! : `missing#${n}`);
		const comps = uniq.map((id, i): Component => ({ id, name: id, file: `${i}.tsx`, line: 1, kind: kinds[i]!, uses: [], usedBy: [] }));
		const byId = new Map(comps.map((c) => [c.id, c]));
		for (const [from, to] of edges) {
			const user = byId.get(idOf(from % uniq.length));
			if (!user) continue;
			user.uses.push(idOf(to));
			byId.get(idOf(to))?.usedBy.push(user.id);
		}
		return comps;
	});

test('the order is the one choosing among every ready component again after each step gives', () => {
	fc.assert(fc.property(graph, (components) => assert.deepEqual(planOrder({ components }), reference({ components }))), { numRuns: 3000 });
});

test('a graph of thousands of components is ordered in a few seconds, not a minute', () => {
	const n = 6000;
	const components: Component[] = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, file: `c${i}.tsx`, line: 1, kind: i % 50 === 0 ? 'route' : 'component', uses: [], usedBy: [] }));
	for (let i = 0; i < n; i++)
		for (const j of [i + 1, i + 7, (i * 13) % n]) {
			if (j >= n || j === i) continue;
			components[j]!.uses.push(`c${i}`);
			components[i]!.usedBy.push(`c${j}`);
		}
	const started = performance.now();
	const order = planOrder({ components });
	assert.equal(order.length, n);
	assert.ok(performance.now() - started < 5000, `took ${Math.round(performance.now() - started)} ms`);
});
