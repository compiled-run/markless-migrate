import { posix } from 'node:path';
import type { Context } from '../context.ts';
import { isDynamic, joinPath } from '../pattern.ts';
import { descendants, lineOf, named, parseTree, stringValue, type TsNode } from '../trees.ts';
import type { AuthGuard, SourceRoute, Write } from '../types.ts';

/** `posts/<int:pk>/` to `/posts/:pk/`; `<path:rest>` to a catch-all. */
export const djangoPath = (route: string) => joinPath(route.replace(/<path:(\w+)>/g, '*$1').replace(/<(?:\w+:)?(\w+)>/g, ':$1'));

/** A `re_path` regex to a pattern: named groups become params, other groups `:param`; the rest kept literally. */
export function djangoRegex(regex: string): string {
	let out = '';
	let i = regex.startsWith('^') ? 1 : 0;
	const end = regex.endsWith('$') ? regex.length - 1 : regex.length;
	while (i < end) {
		const ch = regex[i]!;
		if (ch === '(') {
			let depth = 1;
			let j = i + 1;
			while (j < end && depth) {
				if (regex[j] === '\\') j++;
				else if (regex[j] === '(') depth++;
				else if (regex[j] === ')') depth--;
				j++;
			}
			const group = regex.slice(i, j);
			const name = /^\(\?P<(\w+)>/.exec(group)?.[1];
			const tail = regex[j];
			const optional = tail === '?' || tail === '*';
			out += name ? `:${name}${optional ? '?' : ''}` : ':param';
			i = j + (tail === '?' || tail === '*' || tail === '+' ? 1 : 0);
		} else if (ch === '\\') {
			out += regex[i + 1] === '/' || regex[i + 1] === '.' || regex[i + 1] === '-' ? regex[i + 1] : '';
			i += 2;
		} else if ('?*+'.includes(ch)) i++;
		else {
			out += ch;
			i++;
		}
	}
	return joinPath(out);
}

interface View {
	file: string;
	line: number;
	guards: { role: string | null; how: string; line: number }[];
	writes: string[];
}

const GUARD_DECORATORS: Record<string, (args: TsNode | null) => string | null> = {
	login_required: () => null,
	staff_member_required: () => 'staff',
	superuser_required: () => 'superuser',
	permission_required: (args) => stringValue(named(args)[0]) ?? null,
	user_passes_test: (args) => {
		const test = named(args)[0];
		const attr = test ? [...descendants(test, 'identifier')].map((n) => n.text).find((t) => t.startsWith('is_')) : undefined;
		const name = attr ?? (test?.type === 'identifier' ? test.text : undefined);
		return name ? name.replace(/^(is_|check_|can_)/, '') : null;
	},
};
const GUARD_MIXINS: Record<string, string | null> = { LoginRequiredMixin: null, PermissionRequiredMixin: 'permission', UserPassesTestMixin: 'test', StaffRequiredMixin: 'staff', SuperuserRequiredMixin: 'superuser', AccessMixin: null };
const WRITE_VIEWS = /^(CreateView|UpdateView|DeleteView|FormView|BaseCreateView|BaseUpdateView|BaseDeleteView|ProcessFormView|LoginView|LogoutView|PasswordChangeView|PasswordResetView)$/;

function decoratorInfo(dec: TsNode): { name: string; args: TsNode | null } {
	const inner = named(dec)[0]!;
	if (inner.type === 'call') return { name: inner.childForFieldName('function')?.text.split('.').pop() ?? '', args: inner.childForFieldName('arguments') };
	return { name: inner.text.split('.').pop() ?? '', args: null };
}

function viewFacts(def: TsNode, file: string): View {
	const view: View = { file, line: lineOf(def), guards: [], writes: [] };
	const wrapper = def.parent?.type === 'decorated_definition' ? def.parent : undefined;
	for (const dec of wrapper ? named(wrapper).filter((n) => n.type === 'decorator') : []) {
		const { name, args } = decoratorInfo(dec);
		if (name in GUARD_DECORATORS) view.guards.push({ role: GUARD_DECORATORS[name]!(args), how: `@${name}`, line: lineOf(dec) });
		if (name === 'method_decorator') {
			const target = named(args)[0];
			const tname = target?.text.split('.').pop()?.split('(')[0] ?? '';
			if (tname in GUARD_DECORATORS) view.guards.push({ role: GUARD_DECORATORS[tname]!(target?.type === 'call' ? target.childForFieldName('arguments') : null), how: `@method_decorator(${tname})`, line: lineOf(dec) });
		}
		if (name === 'require_POST') view.writes.push('POST');
		if (name === 'require_http_methods') for (const m of descendants(args!, 'string_content')) if (m.text.toUpperCase() !== 'GET') view.writes.push(m.text.toUpperCase());
	}
	if (def.type === 'class_definition') {
		for (const base of named(def.childForFieldName('superclasses'))) {
			const name = base.text.split('.').pop()!;
			if (name in GUARD_MIXINS) {
				let role: string | null = GUARD_MIXINS[name]!;
				if (role === 'permission') role = [...descendants(def, 'assignment')].filter((a) => a.childForFieldName('left')?.text === 'permission_required').map((a) => stringValue(a.childForFieldName('right')) ?? null)[0] ?? null;
				if (role === 'test') role = null;
				view.guards.push({ role, how: name, line: lineOf(def) });
			}
			if (WRITE_VIEWS.test(name)) view.writes.push('POST');
		}
		for (const m of named(def.childForFieldName('body'))) {
			const fn = m.type === 'decorated_definition' ? m.childForFieldName('definition') : m;
			const n = fn?.type === 'function_definition' ? fn.childForFieldName('name')?.text : undefined;
			if (n && /^(post|put|patch|delete)$/.test(n)) view.writes.push(n.toUpperCase());
		}
	} else {
		for (const cmp of descendants(def, 'comparison_operator')) {
			const parts = named(cmp);
			if (parts.some((p) => p.text === 'request.method')) for (const p of parts) {
				const v = stringValue(p)?.toUpperCase();
				if (v && v !== 'GET' && /^[A-Z]+$/.test(v)) view.writes.push(v);
			}
		}
	}
	view.writes = [...new Set(view.writes)];
	return view;
}

export interface DjangoFound {
	routes: SourceRoute[];
	writes: Write[];
	guards: AuthGuard[];
}

export async function djangoRoutes(ctx: Context): Promise<DjangoFound> {
	const found: DjangoFound = { routes: [], writes: [], guards: [] };
	const moduleFile = (dotted: string, from?: string): string | undefined => {
		const rel = dotted.replace(/^\.+/, '');
		const dots = /^\.+/.exec(dotted)?.[0].length ?? 0;
		const base = dots && from ? posix.join(posix.dirname(from), '../'.repeat(dots - 1)) : '';
		const path = posix.normalize(posix.join(base, rel.split('.').join('/')));
		for (const candidate of [`${path}.py`, `${path}/__init__.py`]) {
			if (ctx.project.has(candidate)) return candidate;
			const nested = ctx.project.files.find((f) => f.endsWith(`/${candidate}`));
			if (nested && !dots) return nested;
		}
		return undefined;
	};
	const trees = new Map<string, TsNode>();
	const tree = async (file: string) => {
		if (!trees.has(file)) trees.set(file, await parseTree('python', await ctx.project.read(file)));
		return trees.get(file)!;
	};
	const findView = async (file: string, expr: TsNode): Promise<View | undefined> => {
		let node = expr;
		const wrappers: { name: string; args: TsNode | null; line: number }[] = [];
		while (node.type === 'call') {
			const fn = node.childForFieldName('function')!;
			const name = fn.text.split('.').pop()!;
			if (name === 'as_view') {
				node = fn.childForFieldName('object')!;
				break;
			}
			const args = node.childForFieldName('arguments');
			wrappers.push({ name, args, line: lineOf(node) });
			const first = named(args)[0];
			if (!first) return undefined;
			node = first;
		}
		const parts = node.text.split('.');
		const name = parts.pop()!;
		const root = await tree(file);
		let target: string | undefined = file;
		if (parts.length) {
			const alias = parts.join('.');
			target = undefined;
			for (const imp of descendants(root, ['import_from_statement', 'import_statement'])) {
				const modNode = imp.childForFieldName('module_name');
				const mod = modNode?.text;
				for (const n of named(imp).filter((c) => c.type === 'dotted_name' || c.type === 'aliased_import')) {
					if (imp.type === 'import_from_statement' && n.startIndex === modNode?.startIndex) continue;
					const local = n.type === 'aliased_import' ? n.childForFieldName('alias')!.text : n.text;
					const real = n.type === 'aliased_import' ? n.childForFieldName('name')!.text : n.text;
					if (local === alias) target = moduleFile(mod ? `${mod}${mod.endsWith('.') ? '' : '.'}${real}` : real, file);
				}
			}
		} else {
			for (const imp of descendants(root, 'import_from_statement')) {
				const mod = imp.childForFieldName('module_name')?.text;
				const modNode = imp.childForFieldName('module_name');
				if (mod && named(imp).some((n) => n.startIndex !== modNode?.startIndex && (n.text === name || n.childForFieldName('alias')?.text === name))) target = moduleFile(mod, file);
			}
		}
		const view: View = target ? await (async () => {
			const r = await tree(target);
			const def = [...descendants(r, ['function_definition', 'class_definition'])].find((d) => d.childForFieldName('name')?.text === name && (d.parent?.type === 'module' || d.parent?.parent?.type === 'module'));
			return def ? viewFacts(def, target) : { file: target, line: 1, guards: [], writes: [] };
		})() : { file, line: lineOf(expr), guards: [], writes: [] };
		for (const w of wrappers) if (w.name in GUARD_DECORATORS) view.guards.push({ role: GUARD_DECORATORS[w.name]!(w.args && named(w.args).length > 1 ? w.args : null), how: `${w.name}()`, line: w.line });
		return view;
	};
	const guards = new Map<string, AuthGuard>();
	let login: string | undefined;
	const visited = new Set<string>();
	const readUrls = async (file: string, prefix: string, depth: number): Promise<void> => {
		if (depth > 8 || visited.has(`${file}@${prefix}`)) return;
		visited.add(`${file}@${prefix}`);
		const root = await tree(file);
		const lists: TsNode[] = [];
		for (const a of descendants(root, ['assignment', 'augmented_assignment'])) if (a.childForFieldName('left')?.text === 'urlpatterns') lists.push(a.childForFieldName('right')!);
		for (const list of lists) {
			for (const call of descendants(list, 'call')) {
				if (call.parent !== list && call.parent?.type !== 'list' && call.parent?.type !== 'binary_operator') continue;
				const fn = call.childForFieldName('function')?.text ?? '';
				if (!/^(path|re_path|url)$/.test(fn.split('.').pop()!)) continue;
				const args = named(call.childForFieldName('arguments'));
				const raw = stringValue(args[0]);
				if (raw === undefined) continue;
				const kwargs = new Map(args.filter((a) => a.type === 'keyword_argument').map((a) => [a.childForFieldName('name')!.text, a.childForFieldName('value')!]));
				const piece = fn.endsWith('path') && !fn.endsWith('re_path') ? djangoPath(raw) : djangoRegex(raw);
				const path = joinPath(prefix, piece);
				const target = args[1];
				if (!target) continue;
				if (target.type === 'call' && /(^|\.)include$/.test(target.childForFieldName('function')?.text ?? '')) {
					const first = named(target.childForFieldName('arguments'))[0];
					const dotted = first?.type === 'tuple' ? stringValue(named(first)[0]) : stringValue(first);
					if (dotted === 'django.contrib.auth.urls') {
						login ??= joinPath(path, 'login/');
						continue;
					}
					const sub = dotted ? moduleFile(dotted, file) : undefined;
					if (sub) await readUrls(sub, path, depth + 1);
					else ctx.limits.push(`${file}:${lineOf(call)}: include(${first?.text}) not resolved`);
					continue;
				}
				if (target.text === 'admin.site.urls') {
					const p = joinPath(path, '*rest?');
					found.routes.push({ path: p, file, line: lineOf(call), dynamic: true, kind: 'page' });
					found.guards.push({ role: 'staff', file, line: lineOf(call), routes: [p], how: 'django admin', redirectTo: joinPath(path, 'login/') });
					continue;
				}
				const view = await findView(file, target);
				if (/LoginView/.test(target.text) || stringValue(kwargs.get('name')) === 'login') login ??= path;
				found.routes.push({ path, file, line: lineOf(call), dynamic: isDynamic(path), kind: 'page' });
				for (const m of view?.writes ?? []) found.writes.push({ method: m, path, handler: { file: view!.file, line: view!.line }, via: 'route' });
				for (const g of view?.guards ?? []) {
					const gfile = g.how.endsWith('()') ? file : view!.file;
					const key = `${gfile}:${g.line}`;
					const entry = guards.get(key) ?? { role: g.role, file: gfile, line: g.line, routes: [], how: g.how };
					entry.routes.push(path);
					guards.set(key, entry);
				}
			}
		}
	};
	let rootConf: string | undefined;
	for (const f of ctx.project.files.filter((f) => /settings(\/[\w]+)?(\.py|\/__init__\.py)$|settings\.py$/.test(f))) {
		const m = /ROOT_URLCONF\s*=\s*['"]([\w.]+)['"]/.exec(await ctx.project.read(f));
		if (m) rootConf = moduleFile(m[1]!);
		const l = /LOGIN_URL\s*=\s*['"]([^'"]+)['"]/.exec(await ctx.project.read(f));
		if (l) login ??= l[1]!.startsWith('/') ? l[1] : undefined;
		if (rootConf) break;
	}
	const urlFiles = ctx.project.files.filter((f) => /(^|\/)urls\.py$/.test(f));
	const included = new Set<string>();
	for (const f of urlFiles) for (const m of (await ctx.project.read(f)).matchAll(/include\(\(?\s*['"]([\w.]+)['"]/g)) included.add(moduleFile(m[1]!, f) ?? '');
	const roots = rootConf ? [rootConf] : urlFiles.filter((f) => !included.has(f));
	for (const f of [...roots, ...urlFiles]) if (![...visited].some((v) => v.startsWith(`${f}@`))) await readUrls(f, '', 0);
	found.guards.push(...guards.values());
	if (login) for (const g of found.guards) g.redirectTo ??= login;
	return found;
}
