import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Component, SourceRoute } from '../source/types.ts';
import { scanLibraries } from './inventory.ts';
import type { ParityResult } from './parity.ts';
import type { ExportUsage, LibrariesFile, LibraryClass, LibraryUsage } from './types.ts';

export const LIBRARIES_FILE = 'libraries.json';

export async function writeLibraries(file: LibrariesFile, dir: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, LIBRARIES_FILE);
	await writeFile(path, `${JSON.stringify(file, null, '\t')}\n`);
	return path;
}

export async function readLibraries(dir: string): Promise<LibrariesFile | undefined> {
	const text = await readFile(join(dir, LIBRARIES_FILE), 'utf8').catch(() => undefined);
	return text ? (JSON.parse(text) as LibrariesFile) : undefined;
}

const HEADINGS: Record<LibraryClass, string> = {
	parity: 'Port the used surface (markless-migrate parity <library>)',
	'markless-ui': 'Map to @markless/ui',
	unknown: 'Not classified (not in the catalog and not installed)',
	'as-is': 'Use as-is (framework-agnostic)',
	framework: 'Replaced by Markless itself',
	drop: 'Nothing to port',
};

const surface = (l: LibraryUsage) => `${l.surface.used}${l.surface.total !== null ? ` of ${l.surface.total}` : ''} export${l.surface.used === 1 ? '' : 's'}${l.surface.members ? `, ${l.surface.members} member${l.surface.members === 1 ? '' : 's'} read` : ''}, ${l.sites} site${l.sites === 1 ? '' : 's'}`;

function exportLine(e: ExportUsage): string {
	const props = Object.keys(e.props).filter((p) => p !== 'children');
	const bits = [
		e.maps ? `-> ${e.maps.target || 'nothing'}${e.maps.available === false ? ' (not in the installed @markless/ui)' : ''}` : '',
		props.length ? `props ${props.slice(0, 8).join(', ')}${props.length > 8 ? ', ...' : ''}` : '',
		e.variants ? Object.entries(e.variants).map(([k, v]) => `${k} ${v.used.join('|') || 'default'} of ${v.available.length}`).join('; ') : '',
		Object.keys(e.options).length ? `options ${Object.keys(e.options).filter((k) => !k.includes('.')).join(', ')}` : '',
		e.reads.length ? `reads ${e.reads.filter((r) => !r.startsWith('->')).slice(0, 6).join(', ')}${e.reads.length > 6 ? ', ...' : ''}` : '',
	].filter(Boolean);
	return `${e.name} (${e.kind}, ${e.sites.length})${bits.length ? `  ${bits.join('  ')}` : ''}`;
}

/** The plan output's account of libraries: what to port, what maps to @markless/ui, what stays. */
export function summarizeLibraries(file: LibrariesFile, detail = 6): string {
	const lines = [`Libraries: ${file.libraries.length}${file.markless_ui ? ` (mapped against @markless/ui ${file.markless_ui} in the new app)` : ''}`];
	for (const cls of Object.keys(HEADINGS) as LibraryClass[]) {
		const libs = file.libraries.filter((l) => l.class === cls);
		if (!libs.length) continue;
		lines.push(`  ${HEADINGS[cls]}: ${libs.length}`);
		const brief = cls === 'as-is' || cls === 'framework' || cls === 'drop';
		for (const l of libs) {
			lines.push(`    ${l.name}${l.version ? ` ${l.version}` : ''}  ${surface(l)}${l.via ? `, only through ${l.via}` : ''}${l.core ? `; keep ${l.core} as-is` : ''}${l.replacement && brief ? ` -> ${l.replacement}` : ''}`);
			if (brief) continue;
			for (const e of l.exports.slice(0, detail)) lines.push(`      ${exportLine(e)}`);
			if (l.exports.length > detail) lines.push(`      ... ${l.exports.length - detail} more in libraries.json`);
			const styled = l.css.styled.map((s) => `${s.token} (${s.sites.length})`);
			if (styled.length) lines.push(`      the app styles what it writes: ${styled.join(', ')}`);
		}
	}
	for (const limit of file.limits) lines.push(`  Limit: ${limit}`);
	return `${lines.join('\n')}\n`;
}

/** Scans the old app's libraries for plan: writes `libraries.json` next to the inventory and returns the summary. */
export async function planLibraries(source: { readonly path: string; readonly routes: SourceRoute[]; readonly components: Component[]; readonly framework: string | null }, stateDir: string, newApp: string): Promise<{ path: string; text: string; file: LibrariesFile }> {
	const file = await scanLibraries(source.path, { routes: source.routes, components: source.components, framework: source.framework, newApp });
	return { path: await writeLibraries(file, stateDir), text: summarizeLibraries(file), file };
}

export function summarizeParity(r: ParityResult): string {
	const lines = [`${r.library}: ${r.exports} export${r.exports === 1 ? '' : 's'} to port, ${r.sites} usage site${r.sites === 1 ? '' : 's'}${r.uncovered ? `, ${r.uncovered} not exercised by a recorded journey` : ''}.`];
	for (const n of r.notes) lines.push(n);
	for (const f of r.written) lines.push(`  wrote ${f}`);
	for (const f of r.kept) lines.push(`  kept ${f} (already ported or edited; delete it to regenerate)`);
	return `${lines.join('\n')}\n`;
}
