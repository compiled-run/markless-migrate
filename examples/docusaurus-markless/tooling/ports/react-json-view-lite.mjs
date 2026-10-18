import { jsonViewLite } from '../source/mdx.mjs';
import { createElement } from '../source/react.mjs';

const lib = await import(`${jsonViewLite}/index.modern.js`);
export const { defaultStyles, allExpanded, collapseAllNested, darkStyles } = lib;

// The data, the class names and whether each node starts expanded (depth-first), for lib/json-view.ts to open and
// close nodes as the library does.
export function JsonView(props) {
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
	const classes = Object.fromEntries(Object.entries(style).filter(([, v]) => typeof v === 'string'));
	return createElement(lib.JsonView, { ...props, 'data-mm-json-view': JSON.stringify({ data, expand, style: { ...classes, ariaLables: style.ariaLables, quotesForFieldNames: style.quotesForFieldNames, noQuotesForStringValues: style.noQuotesForStringValues, stringifyStringValues: style.stringifyStringValues } }) });
}
