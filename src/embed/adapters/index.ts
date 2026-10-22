import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { embedData, type EmbedData } from '../data.ts';
import type { EmbedUse } from '../types.ts';
import { GITHUB_BUTTON } from './github-button/adapter.ts';
import { YOUTUBE } from './youtube/adapter.ts';

/** A pre-built Markless component for one provider's embeds: the result of the study, write and check loop, kept for every site. */
export interface EmbedAdapter {
	readonly id: string;
	readonly provider: string;
	readonly dir: string;
	readonly module: string;
	readonly component: string;
	readonly files: readonly string[];
	/** Files the app serves as they are (a font and its licence), copied into public/embeds/<adapter>/. */
	readonly publicFiles?: readonly string[];
	/** The site and check that certify it: old and new compared by the embed step. */
	readonly certifiedBy: string;
	readonly notes: readonly string[];
	/** The component's props for one embed, from what detection read of it and its data. */
	props(use: EmbedUse, data: EmbedData): Record<string, unknown>;
}

export const ADAPTERS: Readonly<Record<string, EmbedAdapter>> = { [GITHUB_BUTTON.id]: GITHUB_BUTTON, [YOUTUBE.id]: YOUTUBE };

/** Where the shipped adapters' files are. */
export const ADAPTERS_DIR = new URL('.', import.meta.url).pathname;
export const EMBEDS_APP_DIR = 'lib/embeds';

const MARKER = /^\/\/ markless-migrate embed adapter [^\n]* sha256:([0-9a-f]{64})\n/;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const stamped = (adapter: EmbedAdapter, name: string, source: string) => `// markless-migrate embed adapter ${adapter.dir}/${name}, copied by markless-migrate embeds install; do not edit. sha256:${sha256(source)}\n${source}`;
const pristine = (text: string) => {
	const m = MARKER.exec(text);
	return Boolean(m) && sha256(text.slice(m![0].length)) === m![1];
};

/**
 * Copies an adapter into the new app (`lib/embeds/<adapter>/`, stamped, an edited copy kept) and writes the props of
 * every embed that uses it into `lib/embeds/data.json`, read from the provider at convert time through the cache.
 */
export async function installAdapter(adapter: EmbedAdapter, uses: readonly EmbedUse[], app: string, cacheDir: string, options: { refresh?: boolean; fetch?: typeof fetch } = {}): Promise<{ written: string[]; kept: string[]; usage: string }> {
	const dir = join(app, EMBEDS_APP_DIR, adapter.dir);
	await mkdir(dir, { recursive: true });
	const written: string[] = [];
	const kept: string[] = [];
	for (const name of adapter.files) {
		const target = join(dir, name);
		const source = await readFile(join(ADAPTERS_DIR, adapter.dir, name), 'utf8');
		const current = await readFile(target, 'utf8').catch(() => undefined);
		if (current !== undefined && current !== stamped(adapter, name, source) && !pristine(current)) {
			kept.push(relative(app, target));
			continue;
		}
		await writeFile(target, stamped(adapter, name, source));
		written.push(relative(app, target));
	}
	if (adapter.publicFiles?.length) {
		const pub = join(app, 'public', 'embeds', adapter.dir);
		await mkdir(pub, { recursive: true });
		for (const name of adapter.publicFiles) {
			await writeFile(join(pub, name), await readFile(join(ADAPTERS_DIR, adapter.dir, name)));
			written.push(relative(app, join(pub, name)));
		}
	}
	const dataPath = join(app, EMBEDS_APP_DIR, 'data.json');
	const all = JSON.parse(await readFile(dataPath, 'utf8').catch(() => '{}')) as Record<string, unknown>;
	for (const use of uses) all[use.id] = adapter.props(use, await embedData(use, { cacheDir, ...(options.refresh ? { refresh: true } : {}), ...(options.fetch ? { fetch: options.fetch } : {}) }));
	await writeFile(dataPath, `${JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`);
	written.push(relative(app, dataPath));
	const from = `${EMBEDS_APP_DIR}/${adapter.dir}/${adapter.module}`;
	const usage = [`Use it where each embed stood: import { ${adapter.component} } from '<relative path to ${from}>'; it reads its data from ${EMBEDS_APP_DIR}/data.json by the embed's id.`, ...uses.map((u) => `  <${adapter.component} embed="${u.id}" />   on ${u.routes.slice(0, 3).join(', ')}${u.routes.length > 3 ? ` and ${u.routes.length - 3} more` : ''}`), 'Drop the old loader script. Then check: the embed step compares it with the old embed.', ...adapter.notes.map((n) => `Note: ${n}`)].join('\n');
	return { written, kept, usage };
}
