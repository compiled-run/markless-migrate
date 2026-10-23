import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { parseModule, walk, type N } from '../src/source/js.ts';
import { PARTS_DIR } from '../src/convert/parts.ts';

// Markless owns every node of the page it renders: a part that inserts or removes nodes inside the page leaves
// Markless's element census pointing at the wrong elements (resume locates elements by position). Parts switch what is
// shown through Markless state and bindings; they may move focus, set attributes Markless does not bind, and measure.
const NODE_WRITES = new Set(['appendChild', 'insertBefore', 'replaceChild', 'removeChild', 'remove', 'replaceChildren', 'replaceWith', 'append', 'prepend', 'before', 'after', 'insertAdjacentElement', 'insertAdjacentHTML', 'insertAdjacentText']);
const PROPERTY_WRITES = new Set(['innerHTML', 'outerHTML', 'textContent', 'innerText']);

// The shared Radix Dialog port's engine, vendored unchanged from its owner: moves its own Markless-rendered parts.
const OWNED_ELSEWHERE = new Set(['radix/dialog-engine.ts']);

async function files(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await files(path)));
		else if (entry.name.endsWith('.ts')) out.push(path);
	}
	return out;
}

// The site parts a port's own components need, written for ui.shadcn.com: held to the same rule.
const SITE_PARTS = new URL('../examples/shadcn-ui-markless/lib/site/', import.meta.url).pathname;

test('no part inserts or removes nodes in the page Markless renders', async () => {
	const found: string[] = [];
	for (const file of [...(await files(PARTS_DIR)), ...(await files(SITE_PARTS))]) {
		const rel = relative(PARTS_DIR, file);
		if (OWNED_ELSEWHERE.has(rel)) continue;
		const mod = parseModule(file, await readFile(file, 'utf8'));
		// Elements a part builds and has not placed yet are its own; <head> is outside the page Markless renders.
		const built = new Set<string>();
		walk(mod.program, (n: N) => {
			if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'CallExpression' && n.init.callee.type === 'MemberExpression' && n.init.callee.property.name === 'createElement') built.add(n.id.name);
		});
		const outside = (object: N) => (object.type === 'MemberExpression' && object.object.type === 'Identifier' && object.object.name === 'document' && object.property.name === 'documentElement') || (object.type === 'MemberExpression' && /^(classList|relList|style|dataset)$/.test(object.property.name ?? '')) || (object.type === 'MemberExpression' && object.object.type === 'Identifier' && object.object.name === 'document' && object.property.name === 'head') || (object.type === 'Identifier' && built.has(object.name));
		// A served layer is mounted past the page's end comment (reveal.ts afterPage), outside what Markless counts.
		const afterPage = new Set<N>();
		walk(mod.program, (n: N) => {
			if (n.type === 'FunctionDeclaration' && n.id?.name === 'afterPage') walk(n.body, (inner: N) => void afterPage.add(inner));
		});
		walk(mod.program, (n: N) => {
			if (afterPage.has(n)) return;
			if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && NODE_WRITES.has(n.callee.property.name) && !outside(n.callee.object)) found.push(`${rel}:${mod.line(n.start)} ${n.callee.property.name}()`);
			if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && PROPERTY_WRITES.has(n.left.property.name)) found.push(`${rel}:${mod.line(n.start)} ${n.left.property.name} =`);
		});
	}
	assert.deepEqual(found, []);
});
