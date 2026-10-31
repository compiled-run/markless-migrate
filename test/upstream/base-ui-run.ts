// Runs Base UI's tests (base-ui-pages.ts) each on the page of its render: the test file is bundled with base-ui-shim.ts
// for imports, its render call replaced by __render(<id>), and the bundle is run in that page once it is idle.
//   node test/upstream/base-ui-run.ts <base-ui checkout> <origin> <out.json> [repeat]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import ts from 'typescript';
import { PAGES, type Render } from './base-ui-pages.ts';

const SHIMMED: Readonly<Record<string, string>> = { vitest: 'vitest', '#test-utils': 'testUtils', '@mui/internal-test-utils': 'testUtils' };

/** The test file with its imports read from the shim (or a stand-in for anything else) and each paged render replaced. */
export function shimSource(source: string, renders: readonly Render[]): string {
	let out = source;
	for (const r of [...renders].sort((a, b) => b.start - a.start)) out = `${out.slice(0, r.start)}__render(${JSON.stringify(r.id)})${out.slice(r.end)}`;
	const sf = ts.createSourceFile('t.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const edits: { start: number; end: number; text: string }[] = [];
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
		const from = SHIMMED[spec] ? `__shim.${SHIMMED[spec]}` : '__standIn()';
		const clause = stmt.importClause;
		const lines: string[] = [];
		if (clause && !clause.isTypeOnly) {
			if (clause.name) lines.push(`const ${clause.name.text} = __standIn();`);
			const b = clause.namedBindings;
			if (b && ts.isNamespaceImport(b)) lines.push(`const ${b.name.text} = ${SHIMMED[spec] ? from : '__standIn()'};`);
			if (b && ts.isNamedImports(b)) {
				const names = b.elements.filter((e) => !e.isTypeOnly).map((e) => `${(e.propertyName ?? e.name).text}: ${e.name.text}`);
				if (names.length) lines.push(`const { ${names.join(', ')} } = __pick(${from}, ${JSON.stringify(b.elements.map((e) => (e.propertyName ?? e.name).text))});`);
			}
		}
		edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: lines.join(' ') });
	}
	for (const e of edits.reverse()) out = `${out.slice(0, e.start)}${e.text}${out.slice(e.end)}`;
	return `import * as __shim from ${JSON.stringify(join(import.meta.dirname, 'base-ui-shim.ts'))};
const __standIn = () => { const f = () => p; const p: any = new Proxy(f, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : p), apply: () => p, construct: () => p }); return p; };
const __pick = (from: any, names: string[]) => Object.fromEntries(names.map((n) => [n, n in from ? from[n] : __standIn()]));
const __h = __standIn();
${out}`;
}

async function bundle(checkout: string, file: string, renders: readonly Render[]): Promise<string> {
	const req = createRequire(join(checkout, 'package.json'));
	const vite = dirname(req.resolve('vite/package.json'));
	const { rolldown } = createRequire(join(vite, 'package.json'))('rolldown') as { rolldown: (o: object) => Promise<{ generate: (o: object) => Promise<{ output: { code: string }[] }> }> };
	const near = (name: string, from: string) => createRequire(join(dirname(req.resolve(`${from}/package.json`)), 'package.json')).resolve(name);
	const alias: Record<string, string> = {
		'@vitest/expect': near('@vitest/expect', 'vitest'),
		'@vitest/spy': near('@vitest/spy', 'vitest'),
		chai: near('chai', 'vitest'),
		'@testing-library/dom': near('@testing-library/dom', '@mui/internal-test-utils'),
		'@testing-library/user-event': near('@testing-library/user-event', '@mui/internal-test-utils'),
		'@testing-library/jest-dom/matchers': req.resolve('@testing-library/jest-dom/matchers'),
	};
	const source = await readFile(join(checkout, 'packages', 'react', 'src', file), 'utf8');
	const entry = join(checkout, 'upstream-bundles', `${file.replace(/[^\w]+/g, '-')}.tsx`);
	await mkdir(dirname(entry), { recursive: true });
	await writeFile(entry, shimSource(source, renders));
	const build = await rolldown({ input: entry, platform: 'browser', resolve: { alias }, transform: { jsx: { runtime: 'classic', pragma: '__h', pragmaFrag: '__h' }, define: { 'process.env.NODE_ENV': '"test"' } }, logLevel: 'warn' });
	const { output } = await build.generate({ format: 'iife' });
	return output[0]!.code;
}

export async function runBaseUi(checkout: string, origin: string, outFile: string, repeat = 1): Promise<void> {
	const root = resolve(checkout);
	const renders = JSON.parse(await readFile(join(root, 'packages', 'react', PAGES, 'renders.json'), 'utf8')) as Render[];
	const bundles = new Map<string, string>();
	for (const file of new Set(renders.map((r) => r.file))) bundles.set(file, await bundle(root, file, renders.filter((r) => r.file === file)));
	const browser = await chromium.launch();
	const results: { file: string; title: string[]; state: string; error?: string }[] = [];
	try {
		for (let i = 0; i < repeat; i++) {
			for (const r of renders) {
				const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				context.setDefaultTimeout(5000);
				const page = await context.newPage();
				// Who inserts a portal into the page after it loads, for a test that finds one twice.
				await page.addInitScript(() => {
					const seen: string[] = ((globalThis as unknown as { __inserts: string[] }).__inserts = []);
					const note = (node: unknown) => {
						if (node instanceof Element && (node.hasAttribute('data-base-ui-portal') || node.querySelector?.('[data-base-ui-portal]'))) seen.push(String(new Error('inserted').stack).split('\n').slice(1, 7).join(' | '));
					};
					for (const name of ['appendChild', 'insertBefore', 'replaceChild'] as const) {
						const original = Node.prototype[name] as (...a: unknown[]) => unknown;
						(Node.prototype as unknown as Record<string, unknown>)[name] = function (this: Node, ...args: unknown[]) {
							note(args[0]);
							return original.apply(this, args);
						};
					}
					for (const name of ['append', 'prepend', 'after', 'before', 'replaceWith'] as const) {
						const original = Element.prototype[name] as (...a: unknown[]) => unknown;
						(Element.prototype as unknown as Record<string, unknown>)[name] = function (this: Element, ...args: unknown[]) {
							for (const a of args) note(a);
							return original.apply(this, args);
						};
					}
				});
				let result: { state: string; error?: string };
				try {
					await page.goto(new URL(`/r/${r.id}/`, origin).href, { waitUntil: 'networkidle' });
					await page.waitForTimeout(300);
					await page.addScriptTag({ content: bundles.get(r.file)! });
					result = await Promise.race([
						page.evaluate((path) => (globalThis as unknown as { __upstream: { run: (p: readonly string[]) => Promise<{ state: string; error?: string }> } }).__upstream.run(path), r.test),
						new Promise<{ state: string; error: string }>((done) => setTimeout(() => done({ state: 'failed', error: 'timed out after 15 s' }), 15_000)),
					]);
				} catch (error) {
					result = { state: 'failed', error: String((error as Error)?.message ?? error) };
				}
				// What the page held when the test failed: the error alone rarely says which copy a query found twice.
				if (result.state !== 'passed') result.error = `${(result.error ?? '').split('\n').slice(0, 4).join('\n')}\n--- body --- ${await page.evaluate(() => { const b = document.body.cloneNode(true) as HTMLElement; for (const x of b.querySelectorAll('script, style')) x.remove(); return `inserted after load: ${(globalThis as unknown as { __inserts?: string[] }).__inserts?.join(' || ') || 'none'} --- ${b.outerHTML.replace(/\s+/g, ' ').slice(0, 8000)}`; }).catch(() => '')}`;
				results.push({ file: r.file, title: [...r.test], ...result });
				process.stdout.write(`  ${result.state === 'passed' ? 'ok' : 'FAIL'} ${r.file} > ${r.test.join(' > ')}${result.error ? `: ${result.error.split('\n')[0]}` : ''}\n`);
				await context.close();
			}
		}
	} finally {
		await browser.close();
	}
	await writeFile(outFile, JSON.stringify(results));
}

if (import.meta.main) {
	const [checkout, origin, out, repeat] = process.argv.slice(2);
	if (!checkout || !origin || !out) throw new Error('usage: base-ui-run.ts <checkout> <origin> <out.json> [repeat]');
	await runBaseUi(checkout, origin, out, Number(repeat ?? 1));
}
