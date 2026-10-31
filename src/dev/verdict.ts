import type { ProbeEngine } from '../check/ci-settings.ts';
import type { RouteProbe } from './findings.ts';

/** The part of a check report's route result a verdict reads. */
export interface CheckedRoute {
	readonly route: string;
	readonly ok: boolean;
	readonly dimensions?: Readonly<Record<string, string>>;
	readonly failures?: readonly { readonly dimension: string; readonly check: string; readonly accepted?: unknown }[];
	readonly infrastructure?: { readonly message: string };
	readonly blocked?: { readonly message: string };
	readonly template?: { readonly representative: string; readonly pattern: string };
}

export interface RouteVerdict {
	readonly route: string;
	readonly pass: boolean;
	/** Why it fails; empty when it passes. */
	readonly reasons: readonly string[];
	/** A reason that is not the port's (an infrastructure failure, a probe that stopped): run again before trusting the fail. */
	readonly rerun: { readonly check: boolean; readonly engines: readonly ProbeEngine[] };
	readonly notes: readonly string[];
}

/**
 * One route's verdict from the check run and each engine's dead-controls probe, as the full check would judge it: a check route
 * that is not ok, any probe difference, and anything that was not measured are all a fail. There is no third outcome.
 */
export function routeVerdict(route: string, checked: readonly CheckedRoute[] | undefined, probes: Readonly<Partial<Record<ProbeEngine, readonly RouteProbe[]>>>): RouteVerdict {
	const reasons: string[] = [];
	const notes: string[] = [];
	let rerunCheck = false;
	const rerunEngines: ProbeEngine[] = [];
	if (checked) {
		const result = checked.find((r) => r.route === route);
		if (!result) {
			reasons.push('check: no result for the route');
			rerunCheck = true;
		} else if (result.infrastructure) {
			reasons.push(`check: not checked, an infrastructure failure: ${result.infrastructure.message}`);
			rerunCheck = true;
		} else if (result.blocked) reasons.push(`check: blocked: ${result.blocked.message}`);
		else if (!result.ok) {
			const failed = Object.entries(result.dimensions ?? {}).filter(([, state]) => state === 'fail').map(([d]) => d);
			const open = (result.failures ?? []).filter((f) => !f.accepted);
			reasons.push(`check: ${failed.join(', ') || 'red'} (${open.length} failure${open.length === 1 ? '' : 's'}: ${[...new Set(open.map((f) => `${f.dimension}: ${f.check}`))].slice(0, 4).join('; ')})`);
		}
		if (result?.template && result.template.representative !== route) notes.push(`visual, responsiveness, motion and page load are checked on ${result.template.representative}, its template group's representative (${result.template.pattern}), as the full check does`);
	}
	for (const [engine, records] of Object.entries(probes) as [ProbeEngine, readonly RouteProbe[] | undefined][]) {
		const record = records?.find((r) => r.route === route);
		if (!record) {
			reasons.push(`${engine} probe: no result for the route (it stopped)`);
			rerunEngines.push(engine);
		} else if (record.findings.length) reasons.push(`${engine} probe: ${record.findings.length} difference${record.findings.length === 1 ? '' : 's'} from the original`);
	}
	return { route, pass: !reasons.length, reasons, rerun: { check: rerunCheck, engines: rerunEngines }, notes };
}

/** The lines printed for a verdict, the last being the one-word answer. */
export function formatVerdicts(verdicts: readonly RouteVerdict[]): string {
	const lines: string[] = [];
	for (const v of verdicts) {
		lines.push(`${v.pass ? 'PASS' : 'FAIL'}  ${v.route}`);
		for (const r of v.reasons) lines.push(`      ${r}`);
		for (const n of v.notes) lines.push(`      note: ${n}`);
	}
	const failed = verdicts.filter((v) => !v.pass).length;
	lines.push(failed ? `verdict: FAIL (${failed} of ${verdicts.length} route${verdicts.length === 1 ? '' : 's'})` : `verdict: PASS (${verdicts.length} route${verdicts.length === 1 ? '' : 's'})`);
	return `${lines.join('\n')}\n`;
}
