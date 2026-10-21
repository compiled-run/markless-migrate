import fc from 'fast-check';
import type { BrowserContext } from 'playwright';
import { DIALOGS, differences, openSide, reset, runStep, triggerCenters, type Command, type DialogId, type Side, type Snapshot, type Step } from './dialog-oracle.ts';

// Waits in animation milliseconds; none is a multiple of the scenario durations (100, 150, 200, 300, 500 ms).
const WAITS = [0, 0, 33, 77, 123, 177, 261, 419, 811] as const;

// Only the first dialog of a sequence is ever opened from script: a second one opened that way while another is up
// would stack two modal dialogs, which no ported site does and the port does not cover (it renders each dialog where it
// is written, so a later-opened one does not stack above an earlier-written one the way Radix's body portals do).
const command = (dialog: DialogId, scripted = true): fc.Arbitrary<Command> =>
	fc.oneof(
		{ weight: 4, arbitrary: fc.constant<Command>({ kind: 'click-trigger', dialog }) },
		{ weight: scripted ? 2 : 0, arbitrary: fc.constant<Command>({ kind: 'program-trigger', dialog }) },
		{ weight: 3, arbitrary: fc.nat(3).map<Command>((which) => ({ kind: 'click-close', dialog, which })) },
		{ weight: 1, arbitrary: fc.constant<Command>({ kind: 'click-inside', dialog }) },
		{ weight: 2, arbitrary: fc.constant<Command>({ kind: 'click-outside' }) },
		{ weight: 3, arbitrary: fc.constantFrom<Command>({ kind: 'key', key: 'Escape' }, { kind: 'key', key: 'Tab' }, { kind: 'key', key: 'Shift+Tab' }) },
	);

/** A sequence on one dialog, or now and then on two, so one dialog's leftovers meet the next one. */
export const sequences: fc.Arbitrary<Step[]> = fc
	.tuple(fc.constantFrom(...DIALOGS), fc.constantFrom(...DIALOGS), fc.boolean())
	.chain(([first, second, mixed]) =>
		fc.array(
			fc.record({ command: mixed ? fc.oneof(command(first), command(second, second === first)) : command(first), wait: fc.constantFrom(...WAITS) }),
			{ minLength: 1, maxLength: 7 },
		),
	);

export interface Pair {
	readonly radix: Side;
	readonly port: Side;
	readonly radixOrigin: string;
	readonly portOrigin: string;
}

export async function openPair(context: BrowserContext, radixOrigin: string, portOrigin: string): Promise<Pair> {
	return { radix: await openSide(context, radixOrigin), port: await openSide(context, portOrigin), radixOrigin, portOrigin };
}

/** The differences the sequence produces, each named by the step and moment it was seen at. */
export async function compareSequence(pair: Pair, steps: readonly Step[]): Promise<string[]> {
	await Promise.all([reset(pair.radix, pair.radixOrigin), reset(pair.port, pair.portOrigin)]);
	const [radixTriggers, portTriggers] = await Promise.all([triggerCenters(pair.radix.page), triggerCenters(pair.port.page)]);
	const out: string[] = [];
	for (const [i, step] of steps.entries()) {
		const [expected, actual] = await Promise.all([runStep(pair.radix, step, i, radixTriggers), runStep(pair.port, step, i, portTriggers)]);
		out.push(...compareMoments(expected, actual));
		if (out.length) break;
	}
	return out;
}

function compareMoments(expected: readonly Snapshot[], actual: readonly Snapshot[]): string[] {
	const out: string[] = [];
	const byLabel = (list: readonly Snapshot[]) => {
		const map = new Map<string, Snapshot[]>();
		for (const s of list) map.set(s.label, [...(map.get(s.label) ?? []), s]);
		return map;
	};
	const e = byLabel(expected);
	const a = byLabel(actual);
	for (const label of new Set([...e.keys(), ...a.keys()])) {
		const left = e.get(label) ?? [];
		const right = a.get(label) ?? [];
		if (left.length !== right.length) {
			out.push(`${label}: seen ${left.length} time(s) with Radix, ${right.length} with the port`);
			continue;
		}
		for (const [i, snap] of left.entries()) for (const d of differences(snap, right[i]!)) out.push(`${label}: ${d}`);
	}
	return out;
}

export const describeSteps = (steps: readonly Step[]) => steps.map((s) => `${JSON.stringify(s.command)} then ${s.wait} ms`).join('\n  ');
