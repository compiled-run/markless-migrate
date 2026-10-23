// Node module hooks registered after fumadocs-mdx's own loader, so they run first: a content module of a collection is
// compiled by fumadocs-mdx (nextLoad), and what this returns holds only the compiled module's literal exports, so the
// components the content imports (React) are never evaluated.
import { parseSync } from 'oxc-parser';

const KEEP = new Set(['frontmatter', 'structuredData', 'toc', 'lastModified', 'extractedReferences']);

function literal(node) {
	switch (node?.type) {
		case 'Literal':
			return { ok: true, value: node.value };
		// structuredData writes `heading: undefined` for text before the first heading.
		case 'Identifier':
			return node.name === 'undefined' ? { ok: true, value: undefined } : { ok: false };
		case 'TemplateLiteral':
			return node.expressions.length ? { ok: false } : { ok: true, value: node.quasis.map((q) => q.value.cooked).join('') };
		case 'ArrayExpression': {
			const out = [];
			for (const el of node.elements) {
				const v = literal(el);
				if (!v.ok) return v;
				out.push(v.value);
			}
			return { ok: true, value: out };
		}
		case 'ObjectExpression': {
			const out = {};
			for (const p of node.properties) {
				if (p.type !== 'Property' || p.computed) return { ok: false };
				const key = p.key.type === 'Identifier' ? p.key.name : p.key.value;
				const v = literal(p.value);
				if (!v.ok) return v;
				out[key] = v.value;
			}
			return { ok: true, value: out };
		}
		case 'UnaryExpression':
			if (node.operator === '-' && node.argument.type === 'Literal') return { ok: true, value: -node.argument.value };
			return { ok: false };
		default:
			return { ok: false };
	}
}

export async function load(url, context, nextLoad) {
	if (!/[?&]collection=/.test(url) || !/\.mdx?(\?|$)/.test(url)) return nextLoad(url, context);
	const compiled = await nextLoad(url, context);
	const code = String(compiled.source);
	const { program } = parseSync('x.js', code, { sourceType: 'module' });
	const kept = {};
	for (const stmt of program.body) {
		if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration') continue;
		for (const d of stmt.declaration.declarations) {
			if (d.id.type !== 'Identifier' || !KEEP.has(d.id.name)) continue;
			const v = literal(d.init);
			if (v.ok) kept[d.id.name] = v.value;
		}
	}
	return { format: 'module', shortCircuit: true, source: Object.entries(kept).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`).join('\n') || 'export {};' };
}
