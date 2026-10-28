// node scripts/rtl-translations.ts <old site's apps/v4>: the translation table of every RTL example
// (examples/<base>/*-rtl.tsx, components/language-selector.tsx's Translations), written to lib/site/rtl-translations.json.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

type Table = Record<string, { dir: 'ltr' | 'rtl'; locale?: string; values: Record<string, string>; place?: [string, string][] }>;

// Placement props the example computes from the direction (`side={dir === "rtl" ? "left" : "right"}`): each
// language's value, in source order.
const PLACEMENT = new Set(['side', 'align', 'placement']);

const source = process.argv[2];
if (!source) throw new Error('usage: node scripts/rtl-translations.ts <path to the old site apps/v4>');
const out: Record<string, Table> = {};
const skipped: string[] = [];
for (const base of ['radix', 'base', 'aria']) {
	const dir = join(source, 'examples', base);
	for (const file of (await readdir(dir)).filter((f) => f.endsWith('-rtl.tsx')).sort()) {
		const text = await readFile(join(dir, file), 'utf8');
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const tables: Table[] = [];
		const place: [prop: string, rtl: string, ltr: string][] = [];
		const visit = (node: ts.Node) => {
			// `const t: Translations = {…}` or `const t = {…} satisfies Translations`.
			const init = node && ts.isVariableDeclaration(node) && node.initializer && ts.isSatisfiesExpression(node.initializer) && /Translations/.test(node.initializer.type.getText(sf)) ? node.initializer.expression : ts.isVariableDeclaration(node) && node.type && /Translations/.test(node.type.getText(sf)) ? node.initializer : undefined;
			if (init && ts.isObjectLiteralExpression(init)) {
				const js = ts.transpile(`(${init.getText(sf)})`, { target: ts.ScriptTarget.ES2022 });
				try {
					tables.push(new Function(`return ${js.trim().replace(/;$/, '')}`)() as Table);
				} catch (error) {
					skipped.push(`${base}/${file}: ${(error as Error).message}`);
				}
			}
			if (ts.isJsxAttribute(node) && PLACEMENT.has(node.name.getText(sf)) && node.initializer && ts.isJsxExpression(node.initializer)) {
				const e = node.initializer.expression;
				if (e && ts.isConditionalExpression(e) && /^dir\s*===\s*"rtl"$/.test(e.condition.getText(sf)) && ts.isStringLiteral(e.whenTrue) && ts.isStringLiteral(e.whenFalse) && e.whenTrue.text !== e.whenFalse.text) place.push([node.name.getText(sf), e.whenTrue.text, e.whenFalse.text]);
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
		const name = `${base}/${file.replace(/\.tsx$/, '')}`;
		if (!tables.length) skipped.push(`${name}: no Translations table`);
		// One table per example, or its several merged: every key of every table, each language's direction its first's.
		else {
			const table = tables.reduce<Table>((all, t) => Object.fromEntries(Object.entries(t).map(([lang, v]) => [lang, { ...v, ...all[lang], values: { ...all[lang]?.values, ...v.values } }])), {});
			if (place.length) for (const v of Object.values(table)) v.place = place.map(([prop, rtl, ltr]) => [prop, v.dir === 'rtl' ? rtl : ltr]);
			out[name] = table;
		}
	}
}
await writeFile(new URL('../lib/site/rtl-translations.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(out).length} examples; skipped: ${skipped.length ? `\n${skipped.join('\n')}` : 'none'}`);
