import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OVERRIDES_FILE = 'overrides.json';

/** What a library that draws its own UI becomes: a Markless port of the parts the app uses, or the library used directly from Markless code. */
export type EngineChoice = 'port' | 'direct';

/** The rules that accept a difference without a person, each proven by evidence the check collected. */
export const AUTOMATIC_RULES = {
	'old-framework-runtime': "the old framework's own code, which the new page no longer loads",
	'framework-markup': 'markup the old framework adds for itself, with the accessibility tree and announcements otherwise the same',
	'live-embed': 'live content inside a third-party embed that both pages show',
	'embed-live-data': 'a live value a Markless embed component shows (a star count), read at convert time, that has moved since, with every other pixel of the embed the same',
	'unreachable-on-both': 'an element neither page lets a visitor use, for the same reason (covered, hidden or outside the page)',
	'framework-storage': "framework internal: browser storage only the old framework's own code writes (htmx's history keys, Laravel's sealed cookies), which a port without that framework never writes; the app's own keys are still compared",
} as const;
export type AutomaticRule = keyof typeof AUTOMATIC_RULES;

/**
 * Optional expert settings in `.migrate/overrides.json`; a migration never needs the file.
 * `libraries` replaces the decision for a library, `automatic` turns an automatic acceptance rule off.
 */
export interface Overrides {
	readonly libraries?: Readonly<Record<string, EngineChoice>>;
	readonly automatic?: Readonly<Partial<Record<AutomaticRule, boolean>>>;
}

export async function readOverrides(stateDir: string): Promise<Overrides> {
	const path = join(stateDir, OVERRIDES_FILE);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw new Error(`${path}: ${(error as Error).message}`);
	}
	const o = (parsed ?? {}) as { libraries?: unknown; automatic?: unknown };
	const libraries: Record<string, EngineChoice> = {};
	for (const [name, choice] of Object.entries((o.libraries ?? {}) as Record<string, unknown>)) {
		if (choice !== 'port' && choice !== 'direct') throw new Error(`${path}: libraries["${name}"] must be "port" or "direct"`);
		libraries[name] = choice;
	}
	const automatic: Partial<Record<AutomaticRule, boolean>> = {};
	for (const [rule, on] of Object.entries((o.automatic ?? {}) as Record<string, unknown>)) {
		// Retired: a control check could not drive on the old page was compared nowhere, so it is never accepted.
		if (rule === 'undrivable-on-old') continue;
		if (!(rule in AUTOMATIC_RULES)) throw new Error(`${path}: automatic["${rule}"] is not a rule; rules: ${Object.keys(AUTOMATIC_RULES).join(', ')}`);
		if (typeof on !== 'boolean') throw new Error(`${path}: automatic["${rule}"] must be true or false`);
		automatic[rule as AutomaticRule] = on;
	}
	return { libraries, automatic };
}

export function rulesOff(overrides: Overrides): AutomaticRule[] {
	return (Object.keys(AUTOMATIC_RULES) as AutomaticRule[]).filter((rule) => overrides.automatic?.[rule] === false);
}
