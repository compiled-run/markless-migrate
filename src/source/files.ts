import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { parseJsonc } from './js.ts';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'tmp', 'storage', '__pycache__', 'venv', 'site-packages', 'target', 'wp-admin', 'wp-includes']);
const TEXT = /\.(m?[jt]sx?|cjs|cts|vue|svelte|astro|html?|mdx?|rb|erb|php|py|graphql|gql|json|ya?ml|css|toml|txt)$|^(Gemfile|artisan)$/;
const MAX_BYTES = 1_000_000;

export interface Project {
	readonly root: string;
	/** Paths relative to root, posix separators, sorted. */
	readonly files: readonly string[];
	readonly has: (file: string) => boolean;
	readonly read: (file: string) => Promise<string>;
	readonly aliases: readonly { prefix: string; targets: string[] }[];
	readonly packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	readonly deps: Readonly<Record<string, string>>;
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) return;
				await walk(root, path, out);
			} else if (entry.isFile() && TEXT.test(entry.name)) {
				out.push(relative(root, path).split(sep).join('/'));
			}
		}),
	);
}

export async function openProject(root: string): Promise<Project> {
	const files: string[] = [];
	await walk(root, root, files);
	files.sort();
	const set = new Set(files);
	const cache = new Map<string, Promise<string>>();
	const read = (file: string) => {
		let text = cache.get(file);
		if (!text) {
			text = readFile(join(root, file), 'utf8').then((t) => (t.length > MAX_BYTES ? '' : t), () => '');
			cache.set(file, text);
		}
		return text;
	};
	const packageJson = JSON.parse((await read('package.json')) || '{}') as Project['packageJson'];
	const deps = { ...packageJson.devDependencies, ...packageJson.dependencies };
	const aliases = await readAliases(set, read);
	return { root, files, has: (f) => set.has(f), read, aliases, packageJson, deps };
}

async function readAliases(files: Set<string>, read: (f: string) => Promise<string>): Promise<Project['aliases']> {
	const aliases: { prefix: string; targets: string[] }[] = [];
	for (const name of ['tsconfig.json', 'jsconfig.json']) {
		const text = await read(name);
		if (!text) continue;
		const config = parseJsonc(text) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | undefined;
		const base = config?.compilerOptions?.baseUrl ?? '.';
		for (const [key, targets] of Object.entries(config?.compilerOptions?.paths ?? {})) {
			aliases.push({ prefix: key.replace(/\*$/, ''), targets: targets.map((t) => posix.normalize(posix.join(base, t.replace(/\*$/, ''))).replace(/^\.\/?/, '')) });
		}
	}
	const src = [...files].some((f) => f.startsWith('src/')) ? 'src/' : '';
	const app = [...files].some((f) => f.startsWith('app/')) ? 'app/' : src;
	aliases.push({ prefix: '@/', targets: [src, ''] }, { prefix: '~/', targets: [app, src, ''] }, { prefix: '~~/', targets: [''] }, { prefix: '$lib/', targets: ['src/lib/'] }, { prefix: '$lib', targets: ['src/lib'] });
	return aliases;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.vue', '.svelte', '.astro', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs'];

/** The project file an import specifier names, or undefined for packages and unresolved paths. */
export function resolveImport(project: Project, from: string, spec: string): string | undefined {
	const candidates: string[] = [];
	if (spec.startsWith('.')) candidates.push(posix.normalize(posix.join(posix.dirname(from), spec)));
	else {
		for (const alias of project.aliases) {
			if (!spec.startsWith(alias.prefix)) continue;
			for (const target of alias.targets) candidates.push(posix.normalize(target + spec.slice(alias.prefix.length)).replace(/^\.\//, ''));
		}
	}
	for (const base of candidates) {
		const stripped = base.replace(/\.(m?js|jsx)$/, '');
		for (const stem of base === stripped ? [base] : [base, stripped]) {
			for (const ext of EXTENSIONS) if (project.has(stem + ext)) return stem + ext;
		}
	}
	return undefined;
}

export const isTestFile = (file: string) => /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright|stories|\.storybook)\//.test(file) || /\.(test|spec|stories|e2e)\.[a-z]+$/.test(file);
export const isConfigFile = (file: string) => /(^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(file) || /(^|\/)(eslint|prettier|babel|postcss|tailwind)rc/.test(file);
export const isScript = (file: string) => /\.(m?[jt]sx?|cjs|cts|vue|svelte|astro)$/.test(file) && !file.endsWith('.d.ts');
export const dirOf = (file: string) => posix.dirname(file);
