import { posix } from 'node:path';
import type { Context } from '../source/context.ts';
import { resolveImport } from '../source/files.ts';
import { keyName, walk, type N } from '../source/js.ts';
import type { Component, SourceRoute } from '../source/types.ts';

const LAYOUT_ROUTE = /(^|\/)(route|_layout|layout|__root|\+layout)\.[cm]?[jt]sx?$|(^|\/)_[^/.]+\.[jt]sx$/;

/**
 * Which routes render each component: a route file's own components and the ones it names in
 * `component:` (TanStack Router, React Router objects), layout route files for every page below them,
 * then down the component graph to everything they render.
 */
export async function componentRoutes(ctx: Context, routes: readonly SourceRoute[], components: readonly Component[]): Promise<{ byComponent: Map<string, string[]>; byRouteFile: Map<string, string[]> }> {
	const pages = routes.filter((r) => r.kind === 'page');
	const byId = new Map(components.map((c) => [c.id, c]));
	const direct = new Map<string, Set<string>>();
	const add = (id: string, paths: Iterable<string>) => {
		if (!byId.has(id)) return;
		const set = direct.get(id) ?? new Set<string>();
		for (const p of paths) set.add(p);
		direct.set(id, set);
	};
	const routeFiles = new Map<string, string[]>();
	for (const r of pages) routeFiles.set(r.file, [...(routeFiles.get(r.file) ?? []), r.path]);
	const routeDirs = [...new Set(pages.map((r) => r.file.split('/').slice(0, -1).join('/')))];
	const layoutFiles = [...new Set([...routes.map((r) => r.file), ...components.filter((c) => c.kind === 'layout').map((c) => c.file), ...ctx.project.files.filter((f) => LAYOUT_ROUTE.test(f) && routeDirs.some((d) => d === posix.dirname(f) || d.startsWith(`${posix.dirname(f)}/`)))])].filter((f) => LAYOUT_ROUTE.test(f) || components.some((c) => c.file === f && c.kind === 'layout'));
	for (const file of layoutFiles) {
		const dir = posix.dirname(file);
		// An HTML page is rendered by the scripts it loads, not by a layout that sits beside it.
		const below = pages.filter((r) => !/\.html?$/.test(r.file) && ((dir === '.' ? true : r.file.startsWith(`${dir}/`)) || /(^|\/)__root\./.test(file))).map((r) => r.path);
		if (below.length) routeFiles.set(file, [...new Set([...(routeFiles.get(file) ?? []), ...below])]);
	}
	// The browser entry (what index.html loads, or a conventional main file) is around every page.
	const html = await ctx.project.read('index.html');
	const entries = new Set([...html.matchAll(/<script[^>]*\ssrc=["']\/?([^"']+)["']/g)].map((m) => m[1]!).filter((f) => ctx.project.has(f)));
	if (!entries.size && !pages.some((r) => r.entries)) for (const f of ctx.project.files) if (/^(src\/)?(main|entry-client|index)\.[jt]sx$/.test(f)) entries.add(f);
	const all = pages.map((r) => r.path);
	for (const f of entries) if (all.length) routeFiles.set(f, all);
	for (const r of pages) for (const f of r.entries ?? []) routeFiles.set(f, [...new Set([...(routeFiles.get(f) ?? []), r.path])]);
	for (const [file, paths] of routeFiles) {
		for (const c of components) if (c.file === file) add(c.id, paths);
		const mod = await ctx.module(file);
		if (!mod) continue;
		walk(mod.program, (n) => {
			if (n.type !== 'Property' || n.value?.type !== 'Identifier' || !/^(component|pendingComponent|layout|element|Component)$/.test(keyName(n.key) ?? '')) return;
			const local = n.value.name;
			const own = components.find((c) => c.file === file && c.name === local);
			if (own) return add(own.id, paths);
			const imp = mod.imports.get(local);
			const target = imp && resolveImport(ctx.project, file, imp.source);
			if (!target) return;
			const hit = components.find((c) => c.file === target && (c.name === imp.imported || (imp.imported === 'default' && c.kind !== 'component')) ) ?? components.find((c) => c.file === target && c.name === local);
			if (hit) add(hit.id, paths);
		});
	}
	const memo = new Map<string, Set<string>>();
	const resolve = (id: string, stack: Set<string>): Set<string> => {
		const done = memo.get(id);
		if (done) return done;
		if (stack.has(id)) return new Set();
		stack.add(id);
		const out = new Set(direct.get(id) ?? []);
		for (const user of byId.get(id)?.usedBy ?? []) for (const p of resolve(user, stack)) out.add(p);
		stack.delete(id);
		memo.set(id, out);
		return out;
	};
	const result = new Map<string, string[]>();
	for (const c of components) {
		const paths = [...resolve(c.id, new Set())].sort();
		if (paths.length) result.set(c.id, paths);
	}
	return { byComponent: result, byRouteFile: new Map([...routeFiles].map(([f, paths]) => [f, [...new Set(paths)].sort()])) };
}

/** Routes for a site outside any component (a module-level table of icons): the routes of every component in the files that import it, up the import graph. */
export function fileRoutes(file: string, byComponent: ReadonlyMap<string, readonly string[]>, importers: ReadonlyMap<string, readonly string[]>, byRouteFile: ReadonlyMap<string, readonly string[]> = new Map()): string[] {
	const out = new Set<string>();
	const seen = new Set<string>();
	const queue = [file];
	while (queue.length) {
		const f = queue.pop()!;
		if (seen.has(f)) continue;
		seen.add(f);
		let found = false;
		for (const p of byRouteFile.get(f) ?? []) {
			found = true;
			out.add(p);
		}
		for (const [id, paths] of byComponent) {
			if (!id.startsWith(`${f}#`)) continue;
			found = true;
			for (const p of paths) out.add(p);
		}
		if (!found || f === file) queue.push(...(importers.get(f) ?? []));
	}
	return [...out].sort();
}
