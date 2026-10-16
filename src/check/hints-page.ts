import type { CDPSession, Page } from 'playwright';
import type { ElementSnapshot } from './types.ts';

/** What the page itself says about where an element was written: a file and line, a built position to source-map, or a component function. */
export interface RawSource {
	readonly how: string;
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
	/** A position in a served script, 1-based, to follow through its source map. */
	readonly url?: string;
	readonly component?: string;
	/** Index of a component function in `window.__mmFns`, resolved to its definition through the debugger. */
	readonly fn?: number;
}

// Runs inside the page via page.evaluate: must stay self-contained (no imports, no outer references).
export function pageSourceHints(ids: number[]) {
	type Hint = { how: string; file?: string; line?: number; column?: number; url?: string; component?: string; fn?: number };
	const scope = window as unknown as { __mmById?: Map<number, Element>; __mmFns?: unknown[] };
	const fns = (scope.__mmFns ??= []);
	const fnIndex = new Map<unknown, number>(fns.map((f, i) => [f, i]));
	const register = (fn: unknown) => {
		if (!fnIndex.has(fn)) {
			fnIndex.set(fn, fns.length);
			fns.push(fn);
		}
		return fnIndex.get(fn)!;
	};
	const position = (value: string) => {
		const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(value);
		return m ? { file: m[1]!, line: Number(m[2]), ...(m[3] ? { column: Number(m[3]) } : {}) } : { file: value };
	};
	const fromAttributes = (el: Element): Hint | undefined => {
		for (let node: Element | null = el, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
			const a = (name: string) => node!.getAttribute(name) ?? undefined;
			const how = depth ? 'data attribute on an ancestor' : 'data attribute';
			for (const name of ['data-markless-source', 'data-source', 'data-source-loc', 'data-loc']) {
				const v = a(name);
				if (v) return { how, ...position(v) };
			}
			const file = a('data-source-file') ?? a('data-inspector-relative-path') ?? a('data-sentry-source-file');
			if (file) {
				const line = a('data-source-line') ?? a('data-inspector-line');
				const column = a('data-source-column') ?? a('data-inspector-column');
				return { how, file, ...(line ? { line: Number(line) } : {}), ...(column ? { column: Number(column) } : {}), ...(a('data-sentry-component') ? { component: a('data-sentry-component') } : {}) };
			}
		}
		return undefined;
	};
	const fromSvelte = (el: Element): Hint | undefined => {
		const loc = (el as unknown as { __svelte_meta?: { loc?: { file: string; line: number; column: number; char?: number } } }).__svelte_meta?.loc;
		// Svelte 4 counts lines from 0 (and records `char`); Svelte 5 from 1.
		return loc ? { how: 'svelte', file: loc.file, line: loc.char !== undefined ? loc.line + 1 : loc.line, column: loc.column + 1 } : undefined;
	};
	const fromVue = (el: Element): Hint | undefined => {
		const instance = (el as unknown as { __vueParentComponent?: { type?: { __file?: string; __name?: string; name?: string } } }).__vueParentComponent;
		const file = instance?.type?.__file;
		return file ? { how: 'vue', file, component: instance.type?.__name ?? instance.type?.name } : undefined;
	};
	type Fiber = { type?: unknown; return?: Fiber | null; _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number }; _debugStack?: { stack?: string } };
	const fromReact = (el: Element): Hint[] => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		const fiber = key ? ((el as unknown as Record<string, Fiber>)[key] ?? undefined) : undefined;
		if (!fiber) return [];
		if (fiber._debugSource) return [{ how: 'react _debugSource', file: fiber._debugSource.fileName, line: fiber._debugSource.lineNumber, ...(fiber._debugSource.columnNumber ? { column: fiber._debugSource.columnNumber } : {}) }];
		const stack = fiber._debugStack?.stack;
		if (stack) {
			for (const line of stack.split('\n').slice(1)) {
				const m = /\(?((?:https?|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(line);
				if (m && !/react-stack-top-frame|jsx-dev-runtime|jsx-runtime|react-dom|react-server-dom|\/react\/|next\/dist\/compiled/.test(line)) return [{ how: 'react owner stack', url: m[1]!, line: Number(m[2]), column: Number(m[3]) }];
			}
		}
		const out: Hint[] = [];
		for (let f: Fiber | null | undefined = fiber; f && out.length < 6; f = f.return) {
			const t = f.type as { render?: unknown; type?: unknown; name?: string; displayName?: string } | string | undefined;
			const fn = typeof t === 'function' ? t : t && typeof t === 'object' ? (typeof t.render === 'function' ? t.render : typeof t.type === 'function' ? t.type : undefined) : undefined;
			if (!fn) continue;
			const named = fn as { name?: string; displayName?: string };
			out.push({ how: 'react component', fn: register(fn), component: named.displayName ?? named.name ?? '' });
		}
		return out;
	};
	const out: Record<number, Hint[]> = {};
	for (const id of ids) {
		const el = scope.__mmById?.get(id);
		if (!el) continue;
		const direct = fromAttributes(el) ?? fromSvelte(el) ?? fromVue(el);
		const hints = direct ? [direct] : fromReact(el);
		if (hints.length) out[id] = hints;
	}
	return out;
}

async function functionLocations(cdp: CDPSession, count: number): Promise<Map<number, { url: string; line: number; column: number }>> {
	const scripts = new Map<string, string>();
	cdp.on('Debugger.scriptParsed', (e: { scriptId: string; url: string }) => scripts.set(e.scriptId, e.url));
	await cdp.send('Debugger.enable');
	const out = new Map<number, { url: string; line: number; column: number }>();
	try {
		for (let i = 0; i < count; i++) {
			const { result } = await cdp.send('Runtime.evaluate', { expression: `window.__mmFns[${i}]` });
			if (!result.objectId) continue;
			const { internalProperties } = await cdp.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
			const loc = internalProperties?.find((p) => p.name === '[[FunctionLocation]]')?.value?.value as { scriptId: string; lineNumber: number; columnNumber: number } | undefined;
			const url = loc && scripts.get(loc.scriptId);
			if (loc && url) out.set(i, { url, line: loc.lineNumber + 1, column: loc.columnNumber + 1 });
		}
	} finally {
		await cdp.send('Debugger.disable').catch(() => {});
	}
	return out;
}

/** Each element's source hints, with component functions turned into the served position that defines them. */
export async function captureSourceHints(page: Page, elements: readonly ElementSnapshot[]): Promise<ElementSnapshot[]> {
	const hints = await page.evaluate(pageSourceHints, elements.map((e) => e.id)).catch(() => ({}) as Record<number, RawSource[]>);
	const fnCount = await page.evaluate(() => (window as unknown as { __mmFns?: unknown[] }).__mmFns?.length ?? 0).catch(() => 0);
	let located = new Map<number, { url: string; line: number; column: number }>();
	if (fnCount) {
		const cdp = await page.context().newCDPSession(page);
		try {
			located = await functionLocations(cdp, fnCount);
		} catch {
		} finally {
			await cdp.detach().catch(() => {});
		}
	}
	return elements.map((el) => {
		const raw = (hints as Record<number, RawSource[]>)[el.id];
		if (!raw) return el;
		const sources = raw.flatMap((h): RawSource[] => {
			if (h.fn === undefined) return [h];
			const at = located.get(h.fn);
			return at ? [{ how: h.how, url: at.url, line: at.line, column: at.column, ...(h.component ? { component: h.component } : {}) }] : [];
		});
		return sources.length ? { ...el, sources } : el;
	});
}
