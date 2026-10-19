import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseHtml } from '../usage/html.ts';
import { classifyScript, RUNTIME_NAMES } from './classify.ts';

export interface RuntimeHit {
	readonly file: string;
	readonly runtimes: readonly string[];
	/** Inside the build's own bundles (client chunks or the server), or a file copied into the public output. */
	readonly where: 'bundle' | 'public file' | 'inline script';
}

const SCRIPT = /\.(m?js|cjs)$/;

/** Every file of a build output that carries another framework's or library's runtime: no such code may ship in a Markless port. */
export async function scanBuild(dir: string): Promise<{ hits: RuntimeHit[]; files: number }> {
	const hits: RuntimeHit[] = [];
	let files = 0;
	const visit = async (d: string): Promise<void> => {
		for (const entry of await readdir(d, { withFileTypes: true }).catch(() => [])) {
			const path = join(d, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			const rel = relative(dir, path);
			const where: RuntimeHit['where'] = /(^|\/)(server|functions)\//.test(rel) || /(^|\/)(build|_markless|assets)\//.test(rel) ? 'bundle' : 'public file';
			if (SCRIPT.test(entry.name)) {
				files++;
				const runtimes = classifyScript(await readFile(path, 'utf8')).runtimes;
				if (runtimes.length) hits.push({ file: rel, runtimes: runtimes.map((r) => RUNTIME_NAMES[r]), where });
			} else if (entry.name.endsWith('.html')) {
				files++;
				for (const el of parseHtml(await readFile(path, 'utf8'))) {
					if (el.tag !== 'script' || el.attrs.has('src') || !el.text?.trim()) continue;
					const type = el.attrs.get('type');
					if (type && !/javascript|ecmascript|^module$/.test(type)) continue;
					const runtimes = classifyScript(el.text).runtimes;
					if (runtimes.length) hits.push({ file: `${rel}:${el.line}`, runtimes: runtimes.map((r) => RUNTIME_NAMES[r]), where: 'inline script' });
				}
			}
		}
	};
	await visit(dir);
	return { hits, files };
}

export function summarizeBuild(dir: string, result: { hits: readonly RuntimeHit[]; files: number }): string {
	if (!result.hits.length) return `Build guard: ${result.files} script and HTML files in ${dir}, none carries another framework's or library's runtime.\n`;
	const lines = [`Build guard: ${result.hits.length} file${result.hits.length === 1 ? '' : 's'} in ${dir} carry another framework's or library's runtime; a Markless port ships none (implement what the pages use in Markless):`];
	for (const h of result.hits.slice(0, 40)) lines.push(`  FAIL  ${h.file}  ${h.runtimes.join(' + ')} (${h.where})`);
	if (result.hits.length > 40) lines.push(`  ... ${result.hits.length - 40} more`);
	return `${lines.join('\n')}\n`;
}

/**
 * A Vite plugin that fails `vite build` when a chunk carries another framework's runtime:
 * `plugins: [foreignRuntimeGuard()]` in the Markless app's vite.config.
 */
export function foreignRuntimeGuard(): { name: string; apply: 'build'; generateBundle(this: { error(message: string): never }, options: unknown, bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array; fileName: string }>): void } {
	return {
		name: 'markless-migrate:foreign-runtime-guard',
		apply: 'build',
		generateBundle(_options, bundle) {
			const hits: string[] = [];
			for (const item of Object.values(bundle)) {
				const code = item.type === 'chunk' ? item.code : SCRIPT.test(item.fileName) && typeof item.source === 'string' ? item.source : undefined;
				if (!code) continue;
				const runtimes = classifyScript(code).runtimes;
				if (runtimes.length) hits.push(`${item.fileName}: ${runtimes.map((r) => RUNTIME_NAMES[r]).join(' + ')}`);
			}
			if (hits.length) this.error(`another framework's runtime is in the build, and a Markless port ships none:\n${hits.join('\n')}`);
		},
	};
}
