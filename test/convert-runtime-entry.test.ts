import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RuntimeScripts } from '../src/client/builds.ts';
import { cleanDocument, frameworkBuilds } from '../src/convert/clean.ts';
import { head, outer, parseDocument } from '../src/convert/dom.ts';

// A Vite-built React page: the entry module is one import of the chunk holding React, so its own text defines no runtime.
const PAGE = `<!DOCTYPE html><html><head><script type="module" crossorigin src="/assets/entry-a1.js"></script><link rel="modulepreload" crossorigin href="/assets/App-b2.js"><script src="/assets/plain.js"></script><link rel="stylesheet" href="/assets/App-b2.css"></head><body><div id="root"></div></body></html>`;
const FILES: Record<string, string> = {
	'http://old/assets/entry-a1.js': 'import{c as t,j as e}from"./App-b2.js";t.createRoot(document.getElementById("root")).render(e.jsx("div",{}));',
	'http://old/assets/App-b2.js': 'import"./shared-c3.js";const r=Symbol.for("react.transitional.element");export{r as c,r as j};',
	'http://old/assets/shared-c3.js': 'import"./App-b2.js";export const x=1;',
	'http://old/assets/plain.js': 'document.documentElement.classList.add("js");',
};

test("a module script that imports another framework's runtime is that framework's code, and leaves the page with its preload", async () => {
	const reads: string[] = [];
	const runtimes = new RuntimeScripts('http://old', async (url) => {
		reads.push(url);
		return FILES[url];
	});
	const found = await runtimes.among(PAGE);
	assert.deepEqual([...found].sort(), ['http://old/assets/App-b2.js', 'http://old/assets/entry-a1.js']);
	await runtimes.among(PAGE);
	assert.equal(reads.length, new Set(reads).size, 'each script is read once, a cycle included');

	const doc = parseDocument(PAGE);
	cleanDocument(doc, { builds: frameworkBuilds(PAGE).map((b) => b.path), frameworkScripts: found, origin: 'http://old' }, new Map());
	const kept = outer(head(doc));
	assert.doesNotMatch(kept, /entry-a1\.js|App-b2\.js"/);
	assert.match(kept, /plain\.js/, 'a script that loads no runtime stays');
	assert.match(kept, /App-b2\.css/, 'the stylesheet stays');
});
