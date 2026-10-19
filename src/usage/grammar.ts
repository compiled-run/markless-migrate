import { parseSync } from 'oxc-parser';
import { walk, type N } from '../source/js.ts';

/** One trigger of `hx-trigger`, as htmx reads it: the event (or `every <interval>`), its filter and modifiers. */
export interface HtmxTrigger {
	readonly event: string;
	readonly filter?: string;
	readonly every?: string;
	readonly modifiers: Readonly<Record<string, string | true>>;
}

const TRIGGER_MODIFIERS = new Set(['once', 'changed', 'delay', 'throttle', 'from', 'target', 'consume', 'queue']);

/** `hx-trigger` per htmx's grammar: comma-separated triggers, each `event[filter] modifier...` or `every 1s [filter]`. */
export function parseHtmxTrigger(value: string): HtmxTrigger[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of value) {
		if (ch === '[') depth++;
		if (ch === ']') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
		} else current += ch;
	}
	parts.push(current);
	return parts
		.map((p) => p.trim())
		.filter(Boolean)
		.map((part) => {
			const filter = /\[([^\]]*)\]/.exec(part)?.[1];
			const words = part.replace(/\[[^\]]*\]/, ' ').trim().split(/\s+/);
			if (words[0] === 'every') return { event: 'every', every: words[1] ?? '', ...(filter ? { filter } : {}), modifiers: {} };
			const modifiers: Record<string, string | true> = {};
			for (const word of words.slice(1)) {
				const [name, ...rest] = word.split(':');
				if (TRIGGER_MODIFIERS.has(name!)) modifiers[name!] = rest.length ? rest.join(':') : true;
			}
			return { event: words[0]!, ...(filter ? { filter } : {}), modifiers };
		});
}

/** The event an element triggers on when it names none: htmx's defaults. */
export function defaultHtmxTrigger(tag: string, attrs: ReadonlyMap<string, string>): string {
	if (tag === 'form') return 'submit';
	if (tag === 'input' && attrs.get('type') === 'submit') return 'click';
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'change';
	return 'click';
}

const SWAP_STYLES = new Set(['innerHTML', 'outerHTML', 'textContent', 'beforebegin', 'afterbegin', 'beforeend', 'afterend', 'delete', 'none']);

export function parseHtmxSwap(value: string | undefined): { style: string; modifiers: Record<string, string> } {
	const words = (value ?? '').trim().split(/\s+/).filter(Boolean);
	const style = words[0] && SWAP_STYLES.has(words[0]) ? words.shift()! : 'innerHTML';
	const modifiers: Record<string, string> = {};
	for (const word of words) {
		const at = word.indexOf(':');
		if (at > 0) modifiers[word.slice(0, at)] = word.slice(at + 1);
	}
	return { style, modifiers };
}

/** `hx-target`: `this`, `closest <sel>`, `find <sel>`, `next [<sel>]`, `previous [<sel>]`, or a selector. */
export function parseHtmxTarget(value: string | undefined): { relation: string; selector?: string } {
	const v = (value ?? 'this').trim();
	const m = /^(closest|find|next|previous)\b\s*(.*)$/.exec(v);
	if (m) return { relation: m[1]!, ...(m[2] ? { selector: m[2] } : {}) };
	return v === 'this' ? { relation: 'this' } : { relation: 'selector', selector: v };
}

/** class-tools' `classes`: runs separated by `&` play at once; within a run, `op class[:delay]` steps play in turn (100 ms default). */
export function parseClassTools(value: string): { run: number; op: string; className: string; delay: string }[] {
	return value.split('&').flatMap((run, r) =>
		run
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((step) => {
				const [op = '', def = ''] = step.split(/\s+/);
				const [className = '', delay = '100ms'] = def.split(':');
				return { run: r, op, className, delay };
			}),
	);
}

const HS_COMMANDS = new Set(['add', 'remove', 'toggle', 'set', 'put', 'wait', 'send', 'trigger', 'fetch', 'call', 'get', 'log', 'transition', 'show', 'hide', 'go', 'take', 'increment', 'decrement', 'halt', 'return', 'if', 'repeat', 'settle', 'measure', 'tell', 'append', 'make', 'js', 'throw', 'default', 'pick', 'focus', 'blur', 'scroll']);

/** A _hyperscript feature (`on click ...`, `init ...`) and its commands, read by hyperscript's own keywords. */
export interface HyperscriptFeature {
	readonly feature: string;
	readonly events: string[];
	readonly commands: { name: string; args: string }[];
	readonly classes: string[];
	readonly targets: string[];
}

export function parseHyperscript(source: string): HyperscriptFeature[] {
	const tokens = source.match(/"[^"]*"|'[^']*'|<[^>]*\/>|\S+/g) ?? [];
	const features: HyperscriptFeature[] = [];
	let current: { feature: string; events: string[]; commands: { name: string; args: string[] }[]; classes: string[]; targets: string[] } | undefined;
	let expectEvent = false;
	for (const token of tokens) {
		if (token === 'on' && (!current || current.commands.length > 0 || current.events.length === 0) && !(current?.commands.at(-1) && ['add', 'remove', 'toggle', 'put', 'send', 'trigger', 'take'].includes(current.commands.at(-1)!.name))) {
			if (current) features.push(finish(current));
			current = { feature: 'on', events: [], commands: [], classes: [], targets: [] };
			expectEvent = true;
			continue;
		}
		if (token === 'init' || token === 'def' || token === 'behavior' || token === 'worker' || token === 'eventsource' || token === 'socket') {
			if (current) features.push(finish(current));
			current = { feature: token, events: [], commands: [], classes: [], targets: [] };
			continue;
		}
		if (!current) current = { feature: 'on', events: [], commands: [], classes: [], targets: [] };
		if (expectEvent) {
			current.events.push(...token.replace(/\[.*$|\(.*$/, '').split(' or '));
			expectEvent = false;
			continue;
		}
		if (token === 'or' && current.commands.length === 0) {
			expectEvent = true;
			continue;
		}
		if (token === 'then' || token === 'end') continue;
		if (HS_COMMANDS.has(token)) {
			current.commands.push({ name: token, args: [] });
			continue;
		}
		current.commands.at(-1)?.args.push(token);
		if (/^\.[\w-]+$/.test(token)) current.classes.push(token.slice(1));
		if (/^#[\w-]+$|^<.*\/>$|^(me|it|closest|next|previous)$/.test(token)) current.targets.push(token);
	}
	if (current) features.push(finish(current));
	return features;

	function finish(f: { feature: string; events: string[]; commands: { name: string; args: string[] }[]; classes: string[]; targets: string[] }): HyperscriptFeature {
		return { feature: f.feature, events: f.events, commands: f.commands.map((c) => ({ name: c.name, args: c.args.join(' ') })), classes: [...new Set(f.classes)], targets: [...new Set(f.targets)] };
	}
}

/** An Alpine directive attribute (`x-on:click.outside`, `@click`, `:class`, `x-transition:enter.duration.500ms`) as Alpine names it. */
export function parseAlpineAttribute(name: string): { directive: string; value?: string; modifiers: string[] } | undefined {
	let n = name;
	if (n.startsWith('@')) n = `x-on:${n.slice(1)}`;
	else if (n.startsWith(':')) n = `x-bind${n}`;
	if (!n.startsWith('x-')) return undefined;
	const [head, ...modifiers] = n.split('.');
	const [directive, value] = head!.split(':');
	return { directive: directive!, ...(value ? { value } : {}), modifiers };
}

/** Names an Alpine expression reads: its magics (`$refs`, `$dispatch`), and for `x-data`, the keys of the state object. */
export function alpineExpression(source: string): { magics: string[]; keys: string[]; parsed: boolean } {
	const result = parseSync('x.js', `(${source}\n)`, { sourceType: 'script', preserveParens: false });
	const magics = new Set<string>();
	const keys: string[] = [];
	const program = result.program as unknown as N;
	const top = program.body?.[0]?.expression as N | undefined;
	if (top?.type === 'ObjectExpression') for (const p of top.properties as N[]) if (p.type === 'Property' && p.key?.type === 'Identifier') keys.push(p.key.name);
	walk(program, (n) => {
		if (n.type === 'Identifier' && typeof n.name === 'string' && n.name.startsWith('$')) magics.add(n.name);
	});
	return { magics: [...magics], keys, parsed: result.errors.length === 0 };
}
