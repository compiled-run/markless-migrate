import { NOT_EXERCISED } from './locate.ts';

/** A route's result in three words: `differs` where the new site does something else, `incomplete` where some of it was not verified (never green), `pass` when every part was compared and matched. */
export type RouteState = 'pass' | 'differs' | 'incomplete';

interface Stated {
	readonly ok: boolean;
	readonly blocked?: unknown;
	readonly infrastructure?: unknown;
	readonly failures?: readonly { readonly check: string; readonly accepted?: unknown }[];
}

/** A failure that says what was not verified rather than what differs: a control no journey used, or a check stopped at --timeout. */
export const isUnverified = (f: { readonly check: string }): boolean => f.check.startsWith(NOT_EXERCISED) || f.check === 'the check of this route';

export function routeState(r: Stated): RouteState {
	const open = (r.failures ?? []).filter((f) => !f.accepted);
	if (open.some((f) => !isUnverified(f))) return 'differs';
	if (r.blocked || r.infrastructure || open.length) return 'incomplete';
	return r.ok ? 'pass' : 'differs';
}
