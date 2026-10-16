import type { SourceFacts } from '../../src/source/index.ts';
import { planOrder } from '../../src/source/index.ts';

const at = (x: { file: string; line: number }) => `${x.file}:${x.line}`;

/** One line per fact, so a fixture's expectations read like the scan's output. */
export function view(facts: SourceFacts) {
	return {
		framework: facts.framework,
		routes: facts.routes.map((r) => [r.kind, r.path, r.methods?.join(','), r.auth?.length ? `auth=${r.auth.join(',')}` : undefined, at(r)].filter(Boolean).join(' ')),
		nondeterminism: facts.nondeterminism.map((n) => `${n.kind} ${n.what} ${n.side} ${at(n)}`),
		writes: facts.writes.map((w) => [w.method, w.path ?? '-', w.via, w.touches?.length ? `touches=${w.touches.join(',')}` : undefined, at(w.handler)].filter(Boolean).join(' ')),
		clients: facts.clients.map((c) => [c.kind, c.base, JSON.stringify(c.queries ?? []), c.fields?.length ? `fields=${c.fields.join(',')}` : undefined, at(c), c.via ? `via ${at(c.via)}` : undefined].filter(Boolean).join(' ')),
		guards: facts.authGuards.map((g) => [g.role ?? 'signed-in', g.how, `routes=${g.routes.join(',')}`, g.writes ? `writes=${g.writes.join(',')}` : undefined, g.redirectTo ? `login=${g.redirectTo}` : undefined, at(g)].filter(Boolean).join(' ')),
		components: facts.components.map((c) => `${c.kind} ${c.id}${c.uses.length ? ` uses ${c.uses.join(',')}` : ''}`),
		order: planOrder(facts).map((s) => s.name),
		limits: facts.limits,
	};
}
