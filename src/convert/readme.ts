import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';

interface MdNode {
	type: string;
	value?: string;
	depth?: number;
	lang?: string | null;
	url?: string;
	children?: MdNode[];
	position?: { start: { offset?: number }; end: { offset?: number } };
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

export interface Manifest {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export interface ReadmeInputs {
	/** The old app's README, or undefined when it has none. */
	original?: string;
	oldManifest?: Manifest;
	newManifest: Manifest;
	/** The new app's tsconfig.json already loads @markless/typescript-plugin. */
	pluginConfigured: boolean;
	packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
}

const MARKLESS = '[Markless](https://markless.dev) (TSRX)';
const CREATE_MARKLESS = 'create-markless';
const CREATE_MARKLESS_URL = 'https://markless.dev/start/new-app';
const EXTENSION = 'TSRX.tsrx-vscode-plugin';
const MARKETPLACE = `https://marketplace.visualstudio.com/items?itemName=${EXTENSION}`;
const OPEN_VSX = 'https://open-vsx.org/extension/TSRX/tsrx-vscode-plugin';
const EDITOR_DOCS = 'https://markless.dev/tooling/editor-setup';

const FRAMEWORKS: readonly (readonly [dependency: string, label: string])[] = [
	['next', 'Next.js'],
	['@remix-run/react', 'Remix'],
	['@react-router/dev', 'React Router'],
	['gatsby', 'Gatsby'],
	['nuxt', 'Nuxt'],
	['@sveltejs/kit', 'SvelteKit'],
	['astro', 'Astro'],
	['vitepress', 'VitePress'],
	['@docusaurus/core', 'Docusaurus'],
	['@angular/core', 'Angular'],
	['@builder.io/qwik', 'Qwik'],
	['solid-js', 'SolidJS'],
	['preact', 'Preact'],
	['vue', 'Vue'],
	['svelte', 'Svelte'],
	['react', 'React'],
	['htmx.org', 'htmx'],
	['alpinejs', 'Alpine.js'],
];
const CREATE_TOOLS = /^(create-(next|react|remix|vite|nuxt|svelte|astro|gatsby|docusaurus|t3|qwik|solid)[\w-]*|nuxi init|ng new)$/;
const FRAMEWORK_BINS = new Set(['next', 'remix', 'react-router', 'nuxt', 'nuxi', 'astro', 'gatsby', 'vite', 'ng', 'svelte-kit', 'vitepress', 'docusaurus', 'react-scripts']);
const NPM_BUILTINS = new Set(['install', 'i', 'ci', 'add', 'uninstall', 'remove', 'rm', 'update', 'up', 'exec', 'dlx', 'x', 'create', 'init', 'link', 'publish', 'pack', 'audit', 'outdated', 'why', 'list', 'ls', 'config', 'login', 'logout', 'version', 'help', 'import', 'store', 'global', 'cache', 'set', 'upgrade', 'node', 'env']);
const ROLES: readonly (readonly [role: string, aliases: readonly string[]])[] = [
	['dev', ['dev', 'develop', 'serve', 'start:dev', 'dev:server']],
	['build', ['build', 'export', 'generate', 'build:prod']],
	['preview', ['start', 'preview', 'serve:prod', 'start:prod']],
	['test', ['test', 'test:unit', 'vitest', 'jest', 'test:watch']],
	['check', ['lint', 'typecheck', 'type-check', 'check', 'tsc', 'check-types']],
];
const BIN_ROLES: Record<string, string> = { dev: 'dev', develop: 'dev', serve: 'dev', build: 'build', export: 'build', generate: 'build', start: 'preview', preview: 'preview', lint: 'check', test: 'test' };

const STACK_HEADING = /^(the\s+)?(tech(nology)?\s*stack|stack|built\s+with|made\s+with|technolog(y|ies)(\s+used)?|tools?(\s+used)?|under\s+the\s+hood)$/i;
const EDITOR_HEADING = /^(editor|ide)(\s+(setup|support|configuration|integration))?$|^vs\s?code\b/i;
const AFTER_EDITOR = /deploy|licen[cs]e|contribut|learn\s+more|support|credits|acknowledg|authors?|resources/i;
const STACK_CLAIM = /\b(built|made|written|bootstrapped|powered|created|developed)\s+(with|using|on|by|in)\b|^\s*this\s+is\s+an?\b/i;
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'terminal', 'shellsession', 'powershell', 'ps', 'cmd']);

function text(node: MdNode): string {
	if (node.value !== undefined && node.type !== 'code' && node.type !== 'html') return node.value;
	return (node.children ?? []).map(text).join('');
}

function range(node: MdNode): [number, number] {
	return [node.position!.start.offset!, node.position!.end.offset!];
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oldFrameworks(manifest: Manifest | undefined): string[] {
	const deps = { ...manifest?.dependencies, ...manifest?.devDependencies };
	const found = FRAMEWORKS.filter(([dep]) => dep in deps).map(([, label]) => label);
	return found.length ? [...new Set(found)] : [...new Set(FRAMEWORKS.map(([, label]) => label))];
}

/** A list item names the framework only when its label leads, followed by nothing, a version or a separator: "React 19", not "React Hook Form". */
function leadingFramework(item: string, labels: readonly string[]): string | undefined {
	const trimmed = item.trim();
	return labels.find((label) => new RegExp(`^${escapeRegExp(label)}(\\s*v?\\d[\\w.]*)?\\s*($|[-–—:,(/|]|\\b(with|and|for)\\b)`, 'i').test(trimmed));
}

function mentionPattern(labels: readonly string[]): RegExp {
	return new RegExp(`(?<![\\w.@/-])(${labels.map(escapeRegExp).join('|')})(?:\\s+v?\\d+(?:\\.\\d+)*(?![\\w.]))?(?![\\w-])(?!\\s+[A-Z])`, 'g');
}

interface Mention {
	start: number;
	end: number;
	create?: { code: boolean };
}

function mentions(paragraph: MdNode, source: string, labels: readonly string[]): Mention[] {
	const found: Mention[] = [];
	const pattern = mentionPattern(labels);
	const visit = (node: MdNode): void => {
		if (node.type === 'link') {
			const t = text(node).trim();
			const [start, end] = range(node);
			if (CREATE_TOOLS.test(t)) found.push({ start, end, create: { code: (node.children ?? []).some((c) => c.type === 'inlineCode') } });
			else if (leadingFramework(t, labels) && t.replace(mentionPattern(labels), '').trim() === '') found.push({ start, end });
			return;
		}
		if (node.type === 'inlineCode') {
			const [start, end] = range(node);
			if (CREATE_TOOLS.test(node.value!.trim())) found.push({ start, end, create: { code: true } });
			return;
		}
		if (node.type === 'text') {
			const [start, end] = range(node);
			const raw = source.slice(start, end);
			for (const m of raw.matchAll(pattern)) found.push({ start: start + m.index, end: start + m.index + m[0].length });
			return;
		}
		for (const child of node.children ?? []) visit(child);
	};
	visit(paragraph);
	return found.sort((a, b) => a.start - b.start);
}

/** The first framework a paragraph names becomes Markless, later ones are dropped with the "and" or comma joining them. */
function mentionEdits(paragraph: MdNode, source: string, labels: readonly string[]): Edit[] {
	const edits: Edit[] = [];
	let named = false;
	for (const m of mentions(paragraph, source, labels)) {
		if (m.create) {
			const label = m.create.code ? `\`${CREATE_MARKLESS}\`` : CREATE_MARKLESS;
			edits.push({ start: m.start, end: m.end, text: `[${label}](${CREATE_MARKLESS_URL})` });
			continue;
		}
		if (!named) {
			named = true;
			const article = /\ban\s$/i.exec(source.slice(Math.max(0, m.start - 4), m.start));
			if (article) edits.push({ start: m.start - 3, end: m.end, text: `${source[m.start - 3] === 'A' ? 'A' : 'a'} ${MARKLESS}` });
			else edits.push({ start: m.start, end: m.end, text: MARKLESS });
			continue;
		}
		const joiner = /(,\s*|\s+(and|&|\+|\/)\s+|\s*\/\s*)$/i.exec(source.slice(Math.max(0, m.start - 8), m.start));
		if (joiner) edits.push({ start: m.start - joiner[0].length, end: m.end, text: '' });
	}
	return edits;
}

function lineBounds(source: string, start: number, end: number): [number, number] {
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	const next = source.indexOf('\n', end);
	return [lineStart, next === -1 ? source.length : next + 1];
}

function newScript(oldName: string, scripts: Record<string, string>): string | undefined {
	if (oldName in scripts) return oldName;
	for (const [role, aliases] of ROLES) if (aliases.includes(oldName) && role in scripts) return role;
	return undefined;
}

/** One shell line rewritten to the new app's script, the same line when it already fits, or null to drop it. */
export function commandLine(line: string, scripts: Record<string, string>, oldScripts?: Record<string, string>): string | null {
	const m = /^(\s*(?:\$\s+)?)(npm|pnpm|yarn|bun)(\s+run)?\s+([\w:.-]+)(.*)$/.exec(line);
	if (m) {
		const [, lead, pm, run, name, rest] = m as unknown as [string, string, string, string | undefined, string, string];
		if (!run && NPM_BUILTINS.has(name)) return line;
		if (!run && pm === 'npm' && name !== 'start' && name !== 'test') return line;
		const target = newScript(name, scripts);
		if (!target) return oldScripts && !(name in oldScripts) && !ROLES.some(([, aliases]) => aliases.includes(name)) ? line : null;
		const comment = /\s+#.*$/.exec(rest)?.[0] ?? '';
		if (target === name && rest.trim() === comment.trim()) return line;
		const needsRun = pm === 'npm' ? target !== 'start' && target !== 'test' : Boolean(run);
		return `${lead}${pm}${needsRun ? ' run' : ''} ${target}${comment}`;
	}
	const b = /^(\s*(?:\$\s+)?)(?:(npx|bunx|pnpm\s+(?:exec|dlx)|yarn)\s+)?([\w-]+)\s+([\w-]+)(.*)$/.exec(line);
	if (b && FRAMEWORK_BINS.has(b[3]!)) {
		const role = BIN_ROLES[b[4]!];
		const target = role && role in scripts ? role : undefined;
		if (!target) return null;
		const runner = b[2] ?? 'npm';
		const pm = runner.startsWith('pnpm') ? 'pnpm' : runner === 'yarn' ? 'yarn' : runner === 'bunx' ? 'bun' : 'npm';
		const comment = /\s+#.*$/.exec(b[5]!)?.[0] ?? '';
		return `${b[1]}${pm}${pm === 'npm' && target !== 'test' ? ' run' : ''} ${target}${comment}`;
	}
	return line;
}

function codeEdit(node: MdNode, source: string, scripts: Record<string, string>, oldScripts?: Record<string, string>): Edit | undefined {
	if (!SHELL_LANGS.has((node.lang ?? '').toLowerCase())) return undefined;
	const [start, end] = range(node);
	const block = source.slice(start, end);
	const open = block.indexOf('\n');
	const close = block.lastIndexOf('\n');
	if (open === -1 || close <= open) return undefined;
	const lines = block.slice(open + 1, close).split('\n');
	const rewritten = lines.map((l) => commandLine(l.replace(/\r$/, ''), scripts, oldScripts)).map((l, i) => (l === null ? null : l + (lines[i]!.endsWith('\r') ? '\r' : '')));
	if (rewritten.every((l, i) => l === lines[i])) return undefined;
	const kept = rewritten.filter((l): l is string => l !== null);
	const or = (l: string | undefined) => l !== undefined && /^\s*#\s*or\s*$/i.test(l);
	const tidy = kept.filter((l, i) => !(or(l) && (i === 0 || i === kept.length - 1 || or(kept[i + 1]))));
	if (!tidy.some((l) => l.trim() && !/^\s*#/.test(l))) {
		const [s, e] = lineBounds(source, start, end);
		return { start: s, end: e, text: '' };
	}
	return { start: start + open + 1, end: start + close, text: tidy.join('\n') };
}

function inlineCommandEdit(node: MdNode, scripts: Record<string, string>, oldScripts?: Record<string, string>): Edit | undefined {
	const value = node.value!;
	if (value.includes('\n')) return undefined;
	const next = commandLine(value, scripts, oldScripts);
	if (next === null || next === value) return undefined;
	const [start, end] = range(node);
	return { start: start + 1, end: end - 1, text: next };
}

function editorSection(inputs: ReadmeInputs, eol: string, depth: number): string {
	const lines = [
		`${'#'.repeat(depth)} Editor setup`,
		'',
		`Install [TSRX Syntax for VS Code](${MARKETPLACE}) (\`${EXTENSION}\`) to read and edit \`.tsrx\` files. Cursor, Windsurf and other VS Code forks get it from [Open VSX](${OPEN_VSX}).`,
	];
	if (!inputs.pluginConfigured) {
		lines.push(
			'',
			'Install `@markless/typescript-plugin` as a dev dependency and load it in `tsconfig.json`, for types, hints and errors in `.tsrx` files:',
			'',
			'```json',
			'{',
			'\t"tsrx": { "compiler": "@markless/typescript-plugin/volar" },',
			'\t"compilerOptions": { "plugins": [{ "name": "@markless/typescript-plugin" }] }',
			'}',
			'```',
		);
	}
	lines.push('', `More in [Editor setup](${EDITOR_DOCS}).`);
	return lines.join(eol);
}

function fresh(inputs: ReadmeInputs): string {
	const pm = inputs.packageManager ?? 'npm';
	const scripts = inputs.newManifest.scripts ?? {};
	const run = (name: string) => (pm === 'npm' && name !== 'start' && name !== 'test' ? `npm run ${name}` : `${pm} ${name}`);
	const lines = [`# ${inputs.newManifest.name ?? inputs.oldManifest?.name ?? 'App'}`, '', `Built with ${MARKLESS}.`, '', '## Getting started', '', '```bash', `${pm} install`];
	if ('dev' in scripts) lines.push(run('dev'));
	lines.push('```');
	const listed = Object.keys(scripts);
	if (listed.length) lines.push('', '## Scripts', '', ...listed.map((name) => `- \`${run(name)}\`: \`${scripts[name]}\``));
	lines.push('', editorSection(inputs, '\n', 2), '');
	return lines.join('\n');
}

/** The old README with only the stack, the commands and the editor setup changed for the Markless app; every other byte is kept. */
export function migratedReadme(inputs: ReadmeInputs): string {
	const source = inputs.original;
	if (source === undefined || !source.trim()) return fresh(inputs);
	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const root = fromMarkdown(source) as unknown as MdNode;
	const top = root.children ?? [];
	const labels = oldFrameworks(inputs.oldManifest);
	const scripts = inputs.newManifest.scripts ?? {};
	const edits: Edit[] = [];

	const headings = top.map((node, index) => ({ node, index })).filter(({ node }) => node.type === 'heading');
	const sectionEnd = (index: number): number => {
		const depth = top[index]!.depth!;
		const next = top.findIndex((n, i) => i > index && n.type === 'heading' && n.depth! <= depth);
		return next === -1 ? top.length : next;
	};
	const stackBlocks = new Set<MdNode>();
	for (const { node, index } of headings) {
		if (!STACK_HEADING.test(text(node).replace(/[^\p{L}\p{N}\s]/gu, '').trim())) continue;
		for (let i = index + 1; i < sectionEnd(index); i++) stackBlocks.add(top[i]!);
	}

	const handled = new Set<MdNode>();
	for (const block of stackBlocks) {
		if (block.type !== 'list') continue;
		let named = false;
		for (const item of block.children ?? []) {
			const first = item.children?.[0];
			if (!first || first.type !== 'paragraph' || !leadingFramework(text(first), labels)) continue;
			handled.add(first);
			if (!named) {
				named = true;
				const [s, e] = range(first);
				edits.push({ start: s, end: e, text: MARKLESS });
			} else {
				const [s, e] = lineBounds(source, ...range(item));
				edits.push({ start: s, end: e, text: '' });
			}
		}
	}

	const visit = (node: MdNode, inStack: boolean): void => {
		if (handled.has(node)) return;
		if (node.type === 'code') {
			const edit = codeEdit(node, source, scripts, inputs.oldManifest?.scripts);
			if (edit) edits.push(edit);
			return;
		}
		if (node.type === 'paragraph') {
			if (inStack || STACK_CLAIM.test(text(node))) edits.push(...mentionEdits(node, source, labels));
		}
		if (node.type === 'inlineCode') {
			const edit = inlineCommandEdit(node, scripts, inputs.oldManifest?.scripts);
			if (edit) edits.push(edit);
			return;
		}
		for (const child of node.children ?? []) visit(child, inStack);
	};
	for (const node of top) visit(node, stackBlocks.has(node));

	const editor = headings.find(({ node }) => EDITOR_HEADING.test(text(node).trim()));
	const depth = Math.min(...headings.map(({ node }) => node.depth!).filter((d) => d > 1), 2);
	if (editor) {
		const end = sectionEnd(editor.index);
		const [s] = range(editor.node);
		const e = end < top.length ? range(top[end]!)[0] : source.length;
		const trailing = end < top.length ? `${eol}${eol}` : source.endsWith('\n') ? eol : '';
		edits.push({ start: s, end: e, text: editorSection(inputs, eol, editor.node.depth!) + trailing });
	} else {
		const before = headings.find(({ node }) => node.depth! <= depth && node.depth! > 1 && AFTER_EDITOR.test(text(node)));
		if (before) {
			const [s] = range(before.node);
			edits.push({ start: s, end: s, text: `${editorSection(inputs, eol, depth)}${eol}${eol}` });
		} else {
			const tail = source.endsWith('\n') ? '' : eol;
			edits.push({ start: source.length, end: source.length, text: `${tail}${eol}${editorSection(inputs, eol, depth)}${eol}` });
		}
	}

	let out = source;
	for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	return out;
}

async function readJson<T>(file: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(file, 'utf8')) as T;
	} catch {
		return undefined;
	}
}

async function firstFile(dir: string, names: readonly string[]): Promise<string | undefined> {
	for (const name of names) {
		const body = await readFile(join(dir, name), 'utf8').catch(() => undefined);
		if (body !== undefined) return body;
	}
	return undefined;
}

async function pluginConfigured(app: string): Promise<boolean> {
	const raw = await readFile(join(app, 'tsconfig.json'), 'utf8').catch(() => '');
	try {
		const config = JSON.parse(raw) as { compilerOptions?: { plugins?: { name?: string }[] } };
		return (config.compilerOptions?.plugins ?? []).some((p) => p.name === '@markless/typescript-plugin');
	} catch {
		return raw.includes('"@markless/typescript-plugin"');
	}
}

async function packageManager(app: string): Promise<ReadmeInputs['packageManager']> {
	const has = (f: string) => readFile(join(app, f)).then(() => true, () => false);
	if (await has('pnpm-lock.yaml')) return 'pnpm';
	if (await has('yarn.lock')) return 'yarn';
	if ((await has('bun.lock')) || (await has('bun.lockb'))) return 'bun';
	return 'npm';
}

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README'];

/** Writes the app's README from the old one, unless someone edited the README convert wrote last time. */
export async function writeMigratedReadme(options: { app: string; source?: string; state: string }): Promise<'written' | 'unchanged' | 'kept'> {
	const target = join(options.app, 'README.md');
	const record = join(options.state, 'convert', 'readme.json');
	const current = await readFile(target, 'utf8').catch(() => undefined);
	const last = await readJson<{ sha256: string }>(record);
	const hash = (s: string) => createHash('sha256').update(s).digest('hex');
	if (current !== undefined && last && hash(current) !== last.sha256) return 'kept';
	const readme = migratedReadme({
		...(options.source ? { original: await firstFile(options.source, README_NAMES), oldManifest: await readJson<Manifest>(join(options.source, 'package.json')) } : {}),
		newManifest: (await readJson<Manifest>(join(options.app, 'package.json'))) ?? {},
		pluginConfigured: await pluginConfigured(options.app),
		packageManager: await packageManager(options.app),
	});
	await mkdir(join(options.state, 'convert'), { recursive: true });
	await writeFile(record, JSON.stringify({ sha256: hash(readme) }));
	if (readme === current) return 'unchanged';
	await writeFile(target, readme);
	return 'written';
}
