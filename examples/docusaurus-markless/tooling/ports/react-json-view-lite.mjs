import { jsonViewLite } from '../source/mdx.mjs';
import { createElement } from '../source/react.mjs';
import { app } from '../source/output.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lib = await import(`${jsonViewLite}/index.modern.js`);
export const { defaultStyles, allExpanded, collapseAllNested, darkStyles } = lib;

// The data, the class names and whether each node starts expanded (depth-first), for lib/json-view.ts to open and
// close nodes as the library does.
const revive = (value) => {
	if (!value || typeof value !== 'object') return value;
	if (value.$function === true && Object.keys(value).length === 1) return function () {};
	return Array.isArray(value) ? value.map(revive) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
};
export function JsonView(input) {
	const props = { ...input, data: revive(input.data) };
	const style = { ...lib.defaultStyles, ...props.style };
	const shouldExpandNode = props.shouldExpandNode ?? lib.allExpanded;
	const expand = [];
	const walk = (value, level, field) => {
		if (!value || typeof value !== 'object') return;
		const entries = Array.isArray(value) ? value.map((v) => [undefined, v]) : Object.entries(value);
		expand.push(entries.length > 0 && Boolean(shouldExpandNode(level, value, field)));
		for (const [key, child] of entries) walk(child, level + 1, key);
	};
	walk(props.data, 0, undefined);
	const data = JSON.stringify(props.data, function (key, value) {
		const raw = this[key];
		if (raw === undefined) return { $undefined: true };
		if (typeof raw === 'function') return { $function: true };
		if (raw instanceof Date) return { $date: raw.toISOString() };
		return value;
	});
	// The tree's data is a file the page fetches when a node is first opened, as the old page's data chunk.
	const src = `/json-view/${createHash('sha1').update(data).digest('hex').slice(0, 16)}.json`;
	mkdirSync(join(app, 'public/json-view'), { recursive: true });
	writeFileSync(join(app, 'public', src), data);
	const classes = Object.fromEntries(Object.entries(style).filter(([, v]) => typeof v === 'string'));
	const hint = { src, expand: expand.map(Number).join(''), style: { ...classes, ariaLables: style.ariaLables, quotesForFieldNames: style.quotesForFieldNames, noQuotesForStringValues: style.noQuotesForStringValues, stringifyStringValues: style.stringifyStringValues } };
	return createElement(lib.JsonView, { ...props, 'data-mm-json-view': JSON.stringify(hint) });
}
