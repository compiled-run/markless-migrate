// Base UI's tests render their component inline (`await render(<Combobox.Root>…</Combobox.Root>)`). Each such render
// becomes a page of its own (/r/<file>-<n>/), so convert can take it; base-ui-run.ts runs each test on the page of its
// render. A render the page cannot reproduce by itself (it names a test's own variable, or a test renders more than
// once) has no page, and its tests count as not admitted.
//   node test/upstream/base-ui-pages.ts <base-ui checkout> <test file under packages/react/src>...
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/** A render a page reproduces: its JSX, the test file it is in and the names it imports. */
export interface Render {
	readonly id: string;
	readonly file: string;
	readonly jsx: string;
	readonly imports: readonly string[];
	/** The test's title path (describe titles, then its own), as the shim registers it. */
	readonly test: readonly string[];
	readonly start: number;
	readonly end: number;
}

export const PAGES = 'upstream-pages';
export const OUT = 'upstream-dist';
// What a render may name besides its file's imports: globals a page has too.
const GLOBALS = new Set(['undefined', 'console', 'Math', 'JSON', 'String', 'Number', 'Array', 'Object', 'Boolean', 'Date', 'window', 'document', 'NaN', 'Infinity']);

/** The identifiers an expression reads that it does not declare itself. */
function freeNames(node: ts.Node): Set<string> {
	const declared = new Set<string>();
	const used = new Set<string>();
	const visit = (n: ts.Node): void => {
		if (ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) collectBinding(n.name, declared);
		if (ts.isIdentifier(n)) {
			const p = n.parent;
			const named = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || ts.isJsxAttribute(p) || (ts.isJsxNamespacedName(p)) || (ts.isParameter(p) && p.name === n) || (ts.isVariableDeclaration(p) && p.name === n) || (ts.isBindingElement(p) && (p.name === n || p.propertyName === n)) || (ts.isPropertyAccessExpression(p) === false && ts.isQualifiedName(p) && p.right === n);
			const tag = (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === n && /^[a-z]/.test(n.text);
			if (!named && !tag) used.add(n.text);
		}
		if (ts.isShorthandPropertyAssignment(n)) used.add(n.name.text);
		ts.forEachChild(n, visit);
	};
	visit(node);
	for (const name of declared) used.delete(name);
	return used;
}

function collectBinding(name: ts.BindingName, into: Set<string>): void {
	if (ts.isIdentifier(name)) into.add(name.text);
	else for (const el of name.elements) if (!ts.isOmittedExpression(el)) collectBinding(el.name, into);
}

const isTest = (n: ts.Node): n is ts.CallExpression => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'it' || n.expression.text === 'test');
const isDescribe = (n: ts.Node): n is ts.CallExpression => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'describe';
const title = (n: ts.Expression | undefined) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
const isRender = (n: ts.Node): n is ts.CallExpression => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'render' && n.arguments.length > 0;

/** The renders of a test file that a page reproduces: in a test that renders once, naming only what the file imports. */
export function rendersOf(file: string, source: string): Render[] {
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const imported = new Set<string>();
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
		const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
		if (!/^@base-ui\/react\//.test(spec) && spec !== 'react') continue;
		const { name, namedBindings } = stmt.importClause;
		if (name) imported.add(name.text);
		if (namedBindings && ts.isNamespaceImport(namedBindings)) imported.add(namedBindings.name.text);
		if (namedBindings && ts.isNamedImports(namedBindings)) for (const el of namedBindings.elements) imported.add(el.name.text);
	}
	const out: Render[] = [];
	const titles: (string | undefined)[] = [];
	const visit = (n: ts.Node): void => {
		if (isDescribe(n)) {
			titles.push(title(n.arguments[0]));
			ts.forEachChild(n, visit);
			titles.pop();
			return;
		}
		if (isTest(n)) {
			const path = [...titles, title(n.arguments[0])];
			const body = n.arguments[1];
			const calls: ts.CallExpression[] = [];
			const find = (m: ts.Node): void => {
				if (isRender(m)) calls.push(m);
				ts.forEachChild(m, find);
			};
			if (body) find(body);
			const call = calls[0];
			if (calls.length === 1 && call) {
				const arg = call.arguments[0]!;
				const free = [...freeNames(arg)].filter((x) => !GLOBALS.has(x));
				if ((ts.isJsxElement(arg) || ts.isJsxFragment(arg) || ts.isJsxSelfClosingElement(arg)) && free.every((x) => imported.has(x)) && path.every((t) => t !== undefined))
					out.push({ id: `${file.replace(/\.test\.tsx$/, '').replace(/[^\w]+/g, '-').toLowerCase()}-${out.length}`, file, jsx: arg.getText(sf), imports: free, test: path as string[], start: call.getStart(sf), end: call.getEnd() });
			}
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return out;
}

export async function writePages(checkout: string, files: readonly string[]): Promise<Render[]> {
	const root = resolve(checkout);
	const dir = join(root, 'packages', 'react', PAGES);
	await rm(dir, { recursive: true, force: true });
	await mkdir(join(dir, 'r'), { recursive: true });
	const all: Render[] = [];
	for (const file of files) {
		const source = await readFile(join(root, 'packages', 'react', 'src', file), 'utf8');
		const imports = [...source.matchAll(/^import[^;]*from\s+['"](@base-ui\/react\/[^'"]+|react)['"];?$/gm)].map((m) => m[0]);
		for (const r of rendersOf(file, source)) {
			all.push(r);
			const page = join(dir, 'r', r.id);
			await mkdir(page, { recursive: true });
			await writeFile(join(page, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${r.id}</title></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>\n`);
			await writeFile(join(page, 'main.tsx'), `${imports.filter((i) => !/from\s+['"]react['"]/.test(i)).join('\n')}\nimport * as React from 'react';\nimport { createRoot } from 'react-dom/client';\n(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;\nvoid React;\ncreateRoot(document.getElementById('root')!).render(${r.jsx});\n`);
		}
	}
	await writeFile(join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Base UI renders</title></head><body><ul>${all.map((r) => `<li><a href="/r/${r.id}/">${r.id}</a></li>`).join('')}</ul></body></html>\n`);
	const pkg = JSON.parse(await readFile(join(root, 'packages', 'react', 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
	await writeFile(join(dir, 'package.json'), `${JSON.stringify({ name: 'base-ui-renders', private: true, type: 'module', dependencies: { '@base-ui/react': 'workspace:*', ...pkg.dependencies, react: '*', 'react-dom': '*' } }, null, '\t')}\n`);
	await writeFile(join(dir, 'renders.json'), `${JSON.stringify(all, null, '\t')}\n`);
	const input: Record<string, string> = { index: join(dir, 'index.html') };
	for (const r of all) input[r.id] = join(dir, 'r', r.id, 'index.html');
	await writeFile(
		join(root, 'upstream-vite.config.mjs'),
		`import react from '@vitejs/plugin-react';
export default {
	root: ${JSON.stringify(dir)},
	logLevel: 'warn',
	plugins: [react()],
	resolve: { alias: { '@base-ui/react': ${JSON.stringify(join(root, 'packages', 'react', 'src'))}, '@base-ui/utils': ${JSON.stringify(join(root, 'packages', 'utils', 'src'))} } },
	build: { outDir: ${JSON.stringify(join(root, OUT))}, emptyOutDir: true, chunkSizeWarningLimit: 9999, rollupOptions: { input: ${JSON.stringify(input)} } },
};
`,
	);
	return all;
}

if (import.meta.main) {
	const [checkout, ...files] = process.argv.slice(2);
	const all = await writePages(checkout!, files);
	process.stdout.write(`${all.length} renders have a page of their own\n`);
}
