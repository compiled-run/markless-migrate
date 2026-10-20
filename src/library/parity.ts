import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { RecordedJourney, StepResult } from '../check/journeys.ts';
import { matchRoute } from '../source/pattern.ts';
import { PART_BEHAVIOUR, PART_ROLE } from './catalog.ts';
import { decisionLine } from './decide.ts';
import { PORTS, PORTS_DIR, portDir } from './ports/index.ts';
import type { ExportUsage, LibrariesFile, LibraryPort, LibraryUsage, PropUsage, UsageSite } from './types.ts';

export interface ParityOptions {
	/** The Markless app; the port goes in `lib/parity/<library>/` under it. */
	readonly newApp: string;
	/** Narrow the port to what these routes render. */
	readonly routes?: readonly string[];
	/** `.migrate/journeys`, the interactions check recorded on the old app. */
	readonly journeysDir?: string;
}

export interface ParityResult {
	readonly library: string;
	readonly dir: string;
	readonly written: string[];
	/** Skeleton files left alone because they already exist (the port in progress). */
	readonly kept: string[];
	readonly exports: number;
	readonly sites: number;
	/** Sites no recorded journey exercises, so only the static checks see them. */
	readonly uncovered: number;
	readonly notes: string[];
}

const MARKER = 'markless-migrate parity skeleton';
const SIDE_EFFECT = '(side effects)';

export const paritySlug = (name: string) => name.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export function findLibrary(file: LibrariesFile, name: string): LibraryUsage | undefined {
	return file.libraries.find((l) => l.name === name) ?? file.libraries.find((l) => paritySlug(l.name) === paritySlug(name));
}

const routeHit = (siteRoutes: readonly string[] | undefined, wanted: readonly string[]) => !!siteRoutes?.some((r) => wanted.some((w) => r === w || matchRoute(r, w) || matchRoute(w, r)));

function parseProp(raw: string): string | number | boolean | null | undefined {
	if (raw.startsWith('{')) return undefined;
	try {
		const v = JSON.parse(raw) as unknown;
		return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null ? v : undefined;
	} catch {
		return undefined;
	}
}

/** The library as the given routes use it: only their sites, and only the props, options and reads seen in their files. */
export function narrowLibrary(lib: LibraryUsage, routes: readonly string[]): LibraryUsage {
	const exports: ExportUsage[] = [];
	const files = new Set<string>();
	const kept = lib.exports.map((e) => ({ e, sites: e.sites.filter((s) => routeHit(s.routes, routes)).map((s) => ({ ...s, routes: s.routes!.filter((r) => routes.some((w) => r === w || matchRoute(r, w) || matchRoute(w, r))) })) }));
	for (const { sites } of kept) for (const s of sites) files.add(s.file);
	const seen = (e: ExportUsage, key: string) => !e.at?.[key] || e.at[key]!.some((f) => files.has(f));
	for (const { e, sites } of kept) {
		if (!sites.length) continue;
		const props: Record<string, PropUsage> = {};
		for (const s of sites) {
			for (const [key, raw] of Object.entries(s.props ?? {})) {
				const p = (props[key] ??= { values: [], dynamic: 0, sites: 0 });
				p.sites++;
				const v = parseProp(raw);
				if (v === undefined) p.dynamic++;
				else if (!p.values.includes(v)) p.values.push(v);
			}
		}
		const options = Object.fromEntries(Object.entries(e.options).filter(([k]) => seen(e, `option:${k}`)));
		const data = e.data && Object.fromEntries(Object.entries(e.data).filter(([k]) => seen(e, `data:${k}`)));
		const reads = e.reads.filter((r) => seen(e, `read:${r}`));
		const members = Object.fromEntries(Object.entries(e.members).map(([path, list]) => [path, list.filter((m) => seen(e, `member:${path}:${m}`))]).filter(([, list]) => list!.length));
		const variants = e.variants && Object.fromEntries(Object.entries(e.variants).map(([k, v]) => {
			const used = (props[k]?.values ?? []).filter((x): x is string => typeof x === 'string');
			return [k, { ...v, used, classes: Object.fromEntries(used.map((u) => [u, e.variants![k]!.classes[u] ?? ''])) }];
		}));
		exports.push({ ...e, sites, props: e.kind === 'component' ? props : e.props, options, reads, members, ...(variants ? { variants } : {}), ...(data ? { data } : {}) });
	}
	return { ...lib, exports, sites: exports.reduce((n, e) => n + e.sites.length, 0), surface: { ...lib.surface, used: exports.length } };
}

const ident = (name: string) => name.replace(/[^\w$]/g, '_');
const pascal = (name: string) => (name.split('/').pop() ?? name).replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/^(\d)/, '_$1');
/** The local name of an export's skeleton: a default export takes the library's name, since `default` cannot be declared. */
const localName = (lib: LibraryUsage, e: ExportUsage) => (e.name === 'default' ? (e.kind === 'component' || e.kind === 'type' ? pascal(lib.name) : pascal(lib.name).replace(/^./, (c) => c.toLowerCase())) : ident(e.name));
const exportAs = (e: ExportUsage, keyword: 'function' | 'const' | 'type') => (e.name === 'default' ? `${keyword} ` : `export ${keyword} `);
const defaultTail = (lib: LibraryUsage, e: ExportUsage) => (e.name === 'default' ? `\nexport ${e.kind === 'type' ? `type { ${localName(lib, e)} as default }` : `default ${localName(lib, e)}`};\n` : '');
const RENAMES: Record<string, string> = { className: 'class', htmlFor: 'for' };

function literalType(p: PropUsage, widen = false): string {
	const kinds = new Set(p.values.map((v) => (v === null ? 'null' : typeof v)));
	if (!p.values.length) return 'unknown';
	if (p.dynamic || widen) return [...kinds].join(' | ');
	if (kinds.size === 1 && kinds.has('string')) return p.values.map((v) => JSON.stringify(v)).join(' | ');
	if (kinds.size === 1 && kinds.has('number') && p.values.length <= 4) return p.values.map((v) => String(v)).join(' | ');
	return [...kinds].join(' | ');
}

function propType(key: string, p: PropUsage, e?: ExportUsage): string {
	if (key === 'children') return 'Children';
	if (/^on[A-Z]|^on:/.test(key)) return '(value?: unknown) => void';
	if (key === 'ref' && e?.members.ref?.length) return `{ current: ${treeType(tree(e.members.ref), '\t')} | null }`;
	const shape = e && dataType(e, key);
	return shape && literalType(p) === 'unknown' ? shape : literalType(p);
}

interface Shape {
	leaf?: PropUsage;
	path?: string;
	readonly keys: Map<string, Shape>;
	items?: Shape;
}

/** The type of what the app passes under `prop`, from the data paths it writes (`columnDefs[].field`) and what its callbacks read. */
function dataType(e: ExportUsage, prop: string): string | undefined {
	const paths = Object.entries(e.data ?? {}).filter(([k]) => k.startsWith(`${prop}.`) || k.startsWith(`${prop}[]`));
	if (!paths.length) return undefined;
	const root: Shape = { keys: new Map() };
	for (const [path, usage] of paths) {
		let node = root;
		for (const token of path.slice(prop.length).match(/\[\]|[^.[\]]+/g) ?? []) {
			if (token === '[]') node = node.items ??= { keys: new Map() };
			else {
				if (!node.keys.has(token)) node.keys.set(token, { keys: new Map() });
				node = node.keys.get(token)!;
			}
		}
		node.leaf = usage;
		node.path = path;
	}
	const render = (s: Shape, indent: string): string => {
		const parts: string[] = [];
		const reads = s.path ? e.members[s.path] : undefined;
		if (reads?.length) parts.push(`((value: ${treeType(tree(reads), indent)}) => unknown)`);
		else if (s.leaf) parts.push(s.leaf.values.length ? literalType(s.leaf, true) : 'unknown');
		if (s.keys.size) parts.push(`{\n${[...s.keys].map(([k, v]) => `${indent}\treadonly ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}?: ${render(v, `${indent}\t`)};`).join('\n')}\n${indent}}`);
		if (s.items) parts.push(`readonly (${render(s.items, indent)})[]`);
		return [...new Set(parts)].join(' | ') || 'unknown';
	};
	return render(root, '\t');
}

interface Tree {
	[segment: string]: Tree;
}

function tree(labels: readonly string[]): Tree {
	const root: Tree = {};
	for (const label of labels) {
		if (label.startsWith('->') || label === '...') continue;
		let node = root;
		for (const seg of label.split('.')) node = node[seg] ??= {};
	}
	return root;
}

function treeType(t: Tree, indent: string): string {
	const keys = Object.keys(t);
	if (!keys.length) return 'unknown';
	const lines = keys.map((k) => {
		const call = k.endsWith('()');
		const name = k.replace(/\(\)$/, '');
		const inner = treeType(t[k]!, `${indent}\t`);
		return `${indent}\t${/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)}${call ? `(...args: unknown[]): ${inner}` : `: ${inner}`};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function sitesDoc(e: ExportUsage, limit = 6): string {
	const where = e.sites.slice(0, limit).map((s) => `${s.file}:${s.line}${s.routes?.length ? ` (${s.routes.join(', ')})` : ''}`);
	return `${where.join('; ')}${e.sites.length > limit ? `; and ${e.sites.length - limit} more` : ''}`;
}

const usedDirectly = (lib: LibraryUsage) => lib.class === 'dom' && lib.decision?.choice === 'direct' && lib.name === lib.decision.engine;
const needsPort = (lib: LibraryUsage, e: ExportUsage) => !e.maps?.from && (lib.class === 'parity' || (lib.class === 'dom' && !usedDirectly(lib)) || lib.class === 'unknown' || (lib.class === 'markless-ui' && (!e.maps || e.maps.available === false) && !(e.maps?.target.startsWith('<'))));

function componentSkeleton(lib: LibraryUsage, e: ExportUsage): { name: string; code: string; namespace?: [string, string] } {
	const elementSites = e.sites.filter((s) => s.kind === 'element').length || 1;
	const name = localName(lib, e);
	const props = Object.entries(e.props).filter(([k]) => k !== '...');
	const fields = props.map(([k, p]) => {
		const key = RENAMES[k] ?? k;
		const quoted = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
		const values = p.values.length ? ` Written: ${p.values.map((v) => JSON.stringify(v)).join(', ')}${p.dynamic ? `, and an expression at ${p.dynamic} site${p.dynamic === 1 ? '' : 's'}` : ''}.` : p.dynamic ? ` An expression at ${p.dynamic} site${p.dynamic === 1 ? '' : 's'}.` : '';
		const reads = e.members[k]?.length && /^(on[A-Z]|get[A-Z])/.test(k) ? ` Reads ${e.members[k]!.join(', ')} off what it is called with.` : '';
		return `\t/**${k !== key ? ` \`${k}\` in the old app.` : ''}${values}${reads} */\n\treadonly ${quoted}${p.sites >= elementSites ? '' : '?'}: ${propType(k, p, e)};`;
	});
	if (e.props['...']) fields.push(`\t/** The old app spreads props here at ${e.props['...']!.sites} site${e.props['...']!.sites === 1 ? '' : 's'}: check those sites for the props they carry. */\n\treadonly [prop: string]: unknown;`);
	const hasChildren = !!e.props.children;
	const code = `/** ${lib.name} ${e.name}${e.maps?.target ? ` (maps to ${e.maps.target}${e.maps.available === false ? ', not in the installed @markless/ui' : ''})` : ''}. Used at ${sitesDoc(e)}. */
export type ${name}Props = {
${fields.join('\n')}
};

${exportAs(e, 'function')}${name}(${hasChildren ? `{ children }: ${name}Props` : `_props: ${name}Props`}) @{
	<div data-parity-todo=${JSON.stringify(`${lib.name} ${e.name}`)}>${hasChildren ? '{children}' : ''}</div>
}
${defaultTail(lib, e)}`;
	const dot = e.name.indexOf('.');
	return { name, code, ...(dot > 0 ? { namespace: [e.name.slice(0, dot), e.name.slice(dot + 1)] as [string, string] } : {}) };
}

function optionsType(e: ExportUsage, calls: number): string {
	const top = Object.entries(e.options).filter(([k]) => !k.includes('.'));
	if (!top.length) return '';
	const lines = top.map(([k, p]) => {
		const nested = Object.entries(e.options).filter(([n]) => n.startsWith(`${k}.`));
		const type = nested.length ? `{\n${nested.map(([n, q]) => `\t\treadonly ${n.slice(k.length + 1)}?: ${literalType(q, true)};`).join('\n')}\n\t}` : /^on[A-Z]/.test(k) ? '(value?: unknown) => void' : literalType(p, true);
		return `\treadonly ${k}${p.sites >= calls ? '' : '?'}: ${type};`;
	});
	return lines.join('\n');
}

function functionSkeleton(lib: LibraryUsage, e: ExportUsage): string {
	const name = localName(lib, e);
	const typeName = name.charAt(0).toUpperCase() + name.slice(1);
	const calls = e.sites.filter((s) => s.kind === 'call').length || 1;
	const opts = optionsType(e, calls);
	const result = treeType(tree(e.reads), '');
	const notes = [
		e.reads.includes('...') ? `The old app spreads the whole result into a component, so every field the receiving component reads counts.` : '',
		...e.reads.filter((r) => r.startsWith('->')).map((r) => `Passed on as ${r.slice(3)}.`),
	].filter(Boolean);
	const doc = `/** ${lib.name} ${e.name}. Called at ${sitesDoc(e)}.${notes.length ? `\n * ${notes.join('\n * ')}` : ''} */`;
	if (e.kind === 'value') {
		return `${doc}\n${exportAs(e, 'const')}${name}: ${result} = undefined as never;\n${defaultTail(lib, e)}`;
	}
	return `${opts ? `export interface ${typeName}Options {\n${opts}\n}\n\n` : ''}export type ${typeName}Result = ${result};

${doc}
${exportAs(e, 'function')}${name}(${opts ? `_options: ${typeName}Options` : '..._args: unknown[]'}): ${typeName}Result {
	throw new Error(${JSON.stringify(`parity: ${lib.name} ${e.name} is not ported yet`)});
}
${defaultTail(lib, e)}`;
}

function typeSkeleton(lib: LibraryUsage, e: ExportUsage): string {
	const name = localName(lib, e);
	const head = exportAs(e, 'type');
	const tail = defaultTail(lib, e);
	const direct = e.members[''] ?? [];
	const contextual = Object.entries(e.members).filter(([k]) => k !== '');
	const doc = `/** ${lib.name} ${e.name}. Written at ${sitesDoc(e)}. */`;
	if (!direct.length && !contextual.length) return `${doc}\n${head}${name} = unknown;\n${tail}`;
	if (!contextual.length) return `${doc}\n${head}${name} = ${treeType(tree(direct), '')};\n${tail}`;
	const groups = new Map<string, [string, string[]][]>();
	for (const [path, list] of contextual) {
		const [head, ...rest] = path.split('.');
		groups.set(head!, [...(groups.get(head!) ?? []), [rest.join('.'), list]]);
	}
	const fields = [...groups].map(([head, entries]) => {
		const plain = entries.find(([p]) => p === '');
		if (plain) return `\treadonly ${head}?: (value: ${treeType(tree(plain[1]), '\t')}) => unknown;`;
		const ctx = entries.map(([p, list]) => `\t\treadonly ${p}: ${treeType(tree(list), '\t\t')};`).join('\n');
		return `\treadonly ${head}?: (context: {\n${ctx}\n\t}) => unknown;`;
	});
	return `${doc}\n${head}${name} = ${direct.length ? `${treeType(tree(direct), '')} & ` : ''}{\n${fields.join('\n')}\n};\n${tail}`;
}

/** The ARIA role and accessible name a usage site renders, as far as its written props and text tell. */
export function siteTarget(lib: LibraryUsage, e: ExportUsage, s: UsageSite): { role?: string; name?: string } {
	const target = e.maps?.target ?? '';
	const host = /^<(\w+)>$/.exec(target)?.[1];
	const role = PART_ROLE[target] ?? (host === 'button' ? 'button' : host === 'a' ? 'link' : host === 'input' ? 'textbox' : undefined) ?? (/Button$|Trigger$/.test(e.name) && lib.class !== 'parity' ? 'button' : undefined);
	const lit = (k: string) => {
		const v = s.props?.[k] ? parseProp(s.props[k]!) : undefined;
		return typeof v === 'string' ? v : undefined;
	};
	const name = lit('aria-label') ?? lit('title') ?? s.text ?? lit('placeholder');
	return { ...(role ? { role } : {}), ...(name ? { name } : {}) };
}

interface JourneyFile {
	readonly route: string;
	readonly journeys: readonly RecordedJourney[];
}

async function readJourneys(dir: string | undefined): Promise<JourneyFile[]> {
	if (!dir || !(await stat(dir).catch(() => undefined))) return [];
	const out: JourneyFile[] = [];
	for (const name of (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()) {
		try {
			out.push(JSON.parse(await readFile(join(dir, name), 'utf8')) as JourneyFile);
		} catch {
			/* a half-written file from a running check */
		}
	}
	return out;
}

function stepSummary(r: StepResult | undefined): string {
	if (!r) return 'no recorded result';
	const bits = [r.navigated ? `goes to ${r.url}` : '', r.added.length ? `shows ${r.added.slice(0, 3).map((a) => a.replace(/^- /, '')).join('; ')}${r.added.length > 3 ? ` (+${r.added.length - 3})` : ''}` : '', r.removed.length ? `hides ${r.removed.slice(0, 2).map((a) => a.replace(/^- /, '')).join('; ')}${r.removed.length > 2 ? ` (+${r.removed.length - 2})` : ''}` : '', r.moved?.length ? `reorders ${r.moved.slice(0, 2).map((a) => a.replace(/^- /, '')).join('; ')}${r.moved.length > 2 ? ` (+${r.moved.length - 2})` : ''}` : '', r.announcements.length ? `announces ${r.announcements.join('; ')}` : '', r.focus ? `focus on ${r.focus}` : ''].filter(Boolean);
	return bits.join(', ') || 'nothing changes';
}

/** String literals a validation schema declares in the old file, such as `Please enter your email.`, for sites that pass a resolver. */
async function schemaMessages(source: string, s: UsageSite): Promise<string[]> {
	const text = await readFile(join(source, s.file), 'utf8').catch(() => '');
	const m = /resolver\s*:\s*\w+\(\s*(\w+)/.exec(text);
	if (!m) return [];
	const start = text.search(new RegExp(`(const|let|var)\\s+${m[1]}\\s*=`));
	if (start < 0) return [];
	let depth = 0;
	let end = start;
	for (let i = text.indexOf('=', start) + 1; i < text.length; i++) {
		const c = text[i];
		if (c === '(' || c === '{' || c === '[') depth++;
		else if (c === ')' || c === '}' || c === ']') depth--;
		else if (depth === 0 && (c === ';' || (c === '\n' && /^\s*(const|let|var|export|function|interface|type)\b/.test(text.slice(i + 1))))) {
			end = i;
			break;
		}
		end = i;
	}
	return [...text.slice(start, end).matchAll(/(['"`])((?:(?!\1).){8,})\1/g)].map((x) => x[2]!).filter((x) => /\s/.test(x) && !/^[a-z-]+(\s[a-z-]+)*$/.test(x));
}

interface SiteSpec {
	readonly site: UsageSite;
	readonly target: { role?: string; name?: string };
	readonly mustSee: string[];
	readonly journeys: { route: string; journey: string; expect: string[] }[];
}

const LAZY = (engine: string) => `create ${engine} from an \`onVisible\` handler on the element it draws into (\`onIdle\` when it must be ready before it scrolls into view), importing it there with \`await import('${engine}')\` and mounting it on \`event.currentTarget\`, so it never loads with the page; destroy it when the element leaves`;

function domNote(lib: LibraryUsage): string {
	const d = lib.decision;
	const decided = `Decided by plan: ${decisionLine(lib) ?? `port the parts of ${lib.name} this app uses`}. To change it, set "${d?.engine ?? lib.name}": "port" or "direct" under "libraries" in .migrate/overrides.json and run plan again.`;
	if (d?.choice !== 'direct') return `${decided} Fill in the skeleton below with Markless state, computed values and plain DOM, so ${d?.engine ?? lib.name} does not ship.`;
	if (lib.name === d.engine) return `${decided} Nothing to port for ${lib.name} itself: ${LAZY(lib.name)}. Pass it the same options and data the old app passed (listed below).`;
	return `${decided} The skeleton below replaces ${lib.name}; inside it, ${LAZY(d.engine)}. Never render ${lib.framework === 'none' ? 'the old framework' : lib.framework} in the Markless app.`;
}

/** Writes the port skeleton (only what the app uses) and the behaviour spec for each usage site. */
export async function writeParity(file: LibrariesFile, name: string, options: ParityOptions): Promise<ParityResult> {
	const found = findLibrary(file, name);
	if (!found) throw new Error(`no library named ${name} in libraries.json; libraries: ${file.libraries.map((l) => l.name).join(', ')}`);
	const lib = options.routes?.length ? narrowLibrary(found, options.routes) : found;
	if (!lib.exports.length) throw new Error(`${found.name} is not used on ${options.routes!.join(', ')}`);
	const shipped = lib.class === 'ported' ? PORTS[lib.name] : undefined;
	if (shipped) return writePort(file, lib, shipped, options);
	const slug = paritySlug(lib.name);
	const dir = join(options.newApp, 'lib', 'parity', slug);
	const notes: string[] = [];
	if (lib.class === 'as-is') notes.push(`${lib.name} is framework-agnostic: import it from the Markless app unchanged (install ${lib.name}${lib.version ? `@${lib.version}` : ''}); nothing to port.`);
	if (lib.class === 'dom') notes.push(domNote(lib));
	if (lib.class === 'framework') notes.push(`${lib.name} is replaced by ${lib.replacement ?? 'Markless'}; nothing to port.`);
	if (lib.class === 'drop') notes.push(`${lib.name}: ${lib.reason}.`);
	const port = lib.exports.filter((e) => needsPort(lib, e) && e.name !== SIDE_EFFECT);
	const bare = lib.exports.find((e) => e.name === SIDE_EFFECT);
	if (bare && needsPort(lib, bare)) notes.push(`${lib.name} is imported for what it does on load (${bare.sites.map((s) => `${s.file}:${s.line}`).join(', ')}): port that effect, or drop it if only the old framework needed it.`);
	const journeys = await readJourneys(options.journeysDir);
	const specs = new Map<ExportUsage, SiteSpec[]>();
	let uncovered = 0;
	for (const e of lib.exports) {
		const list: SiteSpec[] = [];
		const family = e.maps?.target.split('.')[0];
		for (const s of e.sites) {
			if (s.kind === 'type' || s.kind === 'reference') continue;
			const target = siteTarget(lib, e, s);
			const mustSee: string[] = [];
			const written = Object.entries(s.props ?? {}).filter(([k]) => k !== 'children').map(([k, v]) => `${k}=${v}`);
			if (s.kind === 'element') mustSee.push(`renders${target.role ? ` ${target.role}` : ''}${target.name ? ` "${target.name}"` : ''}${written.length ? ` with ${written.join(' ')}` : ''}`);
			if (s.kind === 'call') {
				const opts = Object.keys(e.options).filter((k) => !k.includes('.'));
				mustSee.push(`called with ${opts.length ? opts.join(', ') : 'no options'}; the result's ${e.reads.filter((r) => !r.startsWith('->')).join(', ') || 'value'} read back`);
				if (e.options.resolver) {
					const messages = await schemaMessages(file.source, s);
					if (messages.length) mustSee.push(`submitting invalid or empty input shows the schema's messages: ${messages.map((m) => `"${m}"`).join(', ')}`);
				}
			}
			for (const b of (family && (PART_BEHAVIOUR[`${family}.root`] ?? PART_BEHAVIOUR[e.maps!.target])) ?? []) if (/root|trigger/.test(e.maps?.target ?? '')) mustSee.push(b);
			const hits: SiteSpec['journeys'] = [];
			for (const jf of journeys) {
				if (!routeHit(s.routes, [jf.route])) continue;
				for (const j of jf.journeys) {
					const at = j.steps.findIndex((step) => (!target.role || step.target.role === target.role) && !!target.name && step.target.name.trim() === target.name.trim());
					if (at < 0) continue;
					hits.push({ route: jf.route, journey: j.name, expect: j.steps.slice(at).map((step, i) => `${step.action} -> ${stepSummary(j.expected[at + i])}`) });
				}
			}
			if (!hits.length && journeys.length) uncovered++;
			list.push({ site: s, target, mustSee, journeys: hits });
		}
		specs.set(e, list);
	}
	const written: string[] = [];
	const kept: string[] = [];
	await mkdir(dir, { recursive: true });
	// A port already written by hand, under any file name, owns the code: only the behaviour spec is refreshed.
	const ported: string[] = [];
	for (const name of (await readdir(dir)).filter((n) => /\.(tsx?|tsrx|vue|svelte|js)$/.test(n)).sort()) {
		const text = await readFile(join(dir, name), 'utf8').catch(() => '');
		if (!text.includes(MARKER)) ported.push(relative(options.newApp, join(dir, name)));
	}
	const put = async (path: string, text: string, skeleton: boolean) => {
		if (skeleton && ported.length) {
			kept.push(...ported.filter((p) => !kept.includes(p)));
			return;
		}
		await writeFile(path, text);
		written.push(relative(options.newApp, path));
	};
	if (port.length) {
		const components = port.filter((e) => e.kind === 'component');
		const rest = port.filter((e) => e.kind !== 'component');
		const head = `// ${MARKER} for ${lib.name}${options.routes?.length ? `, narrowed to ${options.routes.join(', ')}` : ''}: exactly the surface the old app uses. Fill each body in; behaviour.md lists what each usage site must do.\n`;
		if (components.length) {
			const built = components.map((e) => componentSkeleton(lib, e));
			const namespaces = new Map<string, [string, string][]>();
			for (const b of built) if (b.namespace) namespaces.set(b.namespace[0], [...(namespaces.get(b.namespace[0]) ?? []), [b.namespace[1], b.name]]);
			const tail = [...namespaces].filter(([ns]) => !built.some((b) => b.name === ns)).map(([ns, members]) => {
			const object = `{ ${members.map(([m, fn]) => `${m}: ${fn}`).join(', ')} }`;
			return ns === 'default' ? `const ${pascal(lib.name)} = ${object};\nexport default ${pascal(lib.name)};\n` : `export const ${ident(ns)} = ${object};\n`;
		});
			const needsChildren = components.some((e) => e.props.children);
			await put(join(dir, 'components.tsrx'), `${head}${needsChildren ? "import type { Children } from '@markless/core';\n" : ''}\n${built.map((b) => b.code).join('\n')}${tail.length ? `\n${tail.join('')}` : ''}`, true);
		}
		const body = rest.map((e) => (e.kind === 'type' ? typeSkeleton(lib, e) : functionSkeleton(lib, e)));
		const reexport = components.length ? `export * from './components.tsrx';\n${components.some((e) => e.name === 'default' || e.name.startsWith('default.')) ? "export { default } from './components.tsrx';\n" : ''}` : '';
		await put(join(dir, 'index.ts'), `${head}${reexport}${body.length ? `\n${body.join('\n')}` : ''}`, true);
	}
	const json = { library: lib.name, class: lib.class, reason: lib.reason, ...(lib.core ? { core: lib.core } : {}), ...(options.routes?.length ? { routes: options.routes } : {}), exports: lib.exports.map((e) => ({ name: e.name, kind: e.kind, port: needsPort(lib, e), ...(e.maps ? { maps: e.maps } : {}), sites: specs.get(e) ?? [] })) };
	await put(join(dir, 'behaviour.json'), `${JSON.stringify(json, null, '\t')}\n`, false);
	await put(join(dir, 'behaviour.md'), behaviourMarkdown(lib, port, specs, options, journeys.length > 0, notes), false);
	return { library: lib.name, dir, written, kept, exports: port.length, sites: lib.exports.reduce((n, e) => n + e.sites.length, 0), uncovered, notes };
}

const PORT_MARKER = /^\/\/ markless-migrate certified port [^\n]* sha256:([0-9a-f]{64})\n/;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A shipped port file as parity writes it: one first line naming it and the hash of the rest. */
function stamped(port: LibraryPort, name: string, source: string): string {
	return `// markless-migrate certified port ${port.dir}/${name}, copied by markless-migrate parity; do not edit. sha256:${sha256(source)}\n${source}`;
}

function isPristine(text: string): boolean {
	const marker = PORT_MARKER.exec(text);
	return !!marker && sha256(text.slice(marker[0].length)) === marker[1];
}

/** Copies a certified port into the new app and writes which component replaces each part the app uses. */
async function writePort(file: LibrariesFile, lib: LibraryUsage, port: LibraryPort, options: ParityOptions): Promise<ParityResult> {
	const dir = join(options.newApp, portDir(port));
	await mkdir(dir, { recursive: true });
	const written: string[] = [];
	const kept: string[] = [];
	const notes: string[] = [];
	for (const name of port.files) {
		const target = join(dir, name);
		const path = relative(options.newApp, target);
		const source = await readFile(join(PORTS_DIR, port.dir, name), 'utf8');
		const current = await readFile(target, 'utf8').catch(() => undefined);
		// A copy still as parity wrote it is replaced by the port this markless-migrate ships; an edited one is kept.
		if (current !== undefined && current !== stamped(port, name, source) && !isPristine(current)) {
			kept.push(path);
			notes.push(`${path} differs from the certified port this markless-migrate ships: the port is shared by every site, so restore it (delete it and run parity again) and raise what it lacks as a question instead of editing it.`);
			continue;
		}
		await writeFile(target, stamped(port, name, source));
		written.push(path);
	}
	const from = `${portDir(port)}/${port.module}`;
	const users = [lib, ...file.libraries.filter((l) => l.local)].flatMap((l) => l.exports.filter((e) => e.maps?.from === from).map((e) => ({ owner: l, e })));
	const lines = [`# ${lib.name}: the certified Markless port`, '', `Copied by markless-migrate parity from the port markless-migrate ships. Certified against ${port.library} ${port.version} by ${port.certifiedBy}: generated action sequences on the real library and on this port show the same markup, attributes, focus and animation frames. Do not edit these files; every site shares them.`, '', `Import from \`${from}\`. Each part renders the library's own markup (\`data-state\`, \`role\`, ids and aria references), so the old classes and selectors work unchanged. Element props (class, id, data-*, aria-*, event handlers) pass through to the element a part renders.`, '', '| Library export | Component | Props it covers | Not covered |', '| --- | --- | --- | --- |'];
	for (const [name, part] of Object.entries(port.parts)) lines.push(`| ${name} | ${part.component} | ${part.props.join(', ')}${part.note ? ` (${part.note})` : ''} | ${Object.entries(part.unsupported).map(([k, why]) => `${k}: ${why}`).join('; ') || 'nothing'} |`);
	lines.push('', ...port.notes.map((n) => `- ${n}`), '', '## What the app uses', '');
	for (const { owner, e } of users) {
		lines.push(`- ${owner.name === lib.name ? '' : `${owner.name} `}${e.name} -> ${e.maps!.target}${e.maps!.available === false ? ` (${e.maps!.note})` : ''}`);
		const part = Object.values(port.parts).find((p) => p.component === e.maps!.target);
		for (const s of e.sites) {
			const uncovered = Object.keys(s.props ?? {}).filter((k) => part && k in part.unsupported);
			if (uncovered.length) lines.push(`  - ${uncovered.join(', ')} at ${s.file}:${s.line}: not covered by the port; ask, do not work around it`);
		}
	}
	// Ports of several libraries can share a directory; each library's account is its own file.
	const spec = join(dir, `${port.module.replace(/\.[^.]+$/, '')}.behaviour.md`);
	await writeFile(spec, `${lines.join('\n')}\n`);
	written.push(relative(options.newApp, spec));
	if (users.some(({ e }) => e.maps!.available === false)) notes.push(`${lib.name}: the app passes props the port does not cover; behaviour.md lists each one and where.`);
	return { library: lib.name, dir, written, kept, exports: 0, sites: lib.exports.reduce((n, e) => n + e.sites.length, 0), uncovered: 0, notes };
}

function behaviourMarkdown(lib: LibraryUsage, port: readonly ExportUsage[], specs: Map<ExportUsage, SiteSpec[]>, options: ParityOptions, recorded: boolean, notes: readonly string[]): string {
	const lines = [`# ${lib.name}: parity spec`, '', `Generated by markless-migrate parity from .migrate/libraries.json${options.routes?.length ? `, narrowed to ${options.routes.join(', ')}` : ''}. Regenerated on every run; edit the port, not this file.`, '', `Class: ${lib.class}. ${lib.reason}.${lib.core ? ` Keep ${lib.core} as-is under the port.` : ''}`, ''];
	lines.push('Rules: port only the surface listed here (same names, same props and options, nothing more). Prefer a @markless/ui family wherever one maps. Never render React, Vue or Svelte inside the Markless app. A difference the old app shows at a usage site is a failure of the port, not of the site.', '');
	for (const n of notes) lines.push(`Note: ${n}`, '');
	if (port.length) lines.push(`To port (${port.length}): ${port.map((e) => e.name).join(', ')}. Skeleton: index.ts${port.some((e) => e.kind === 'component') ? ' and components.tsrx' : ''}.`, '');
	if (!recorded) lines.push('No interactions recorded yet: run `markless-migrate check` on these routes once, then `parity` again, and each site lists the journeys that exercise it.', '');
	for (const e of lib.exports) {
		lines.push(`## ${e.name} (${e.kind}${e.maps ? `, -> ${e.maps.target || 'nothing to port'}${e.maps.available === false ? ', missing from the installed @markless/ui: port it' : ''}` : ''})`, '');
		const props = Object.entries(e.props).filter(([k]) => k !== '...' && k !== 'children');
		if (props.length) lines.push(`Props: ${props.map(([k, p]) => `${k}${p.values.length ? ` ${p.values.map((v) => JSON.stringify(v)).join('|')}` : ''}${p.dynamic ? ' {expr}' : ''}`).join('; ')}`, '');
		if (e.variants) for (const [k, v] of Object.entries(e.variants)) lines.push(`Variant ${k}: uses ${v.used.join(', ') || 'only the default'} of ${v.available.join(', ')}${v.used.length ? `; classes: ${v.used.map((u) => `${u} = \`${v.classes[u]}\``).join('; ')}` : ''}`, '');
		if (Object.keys(e.options).length) lines.push(`Options: ${Object.entries(e.options).map(([k, p]) => `${k}${p.values.length ? ` = ${p.values.map((v) => JSON.stringify(v)).join('|')}` : ''}`).join(', ')}`, '');
		if (e.data && Object.keys(e.data).length) lines.push(`Data passed: ${Object.entries(e.data).map(([k, p]) => `${k}${p.values.length ? ` = ${p.values.map((v) => JSON.stringify(v)).join('|')}` : ''}${p.dynamic ? ' {expr}' : ''}`).join('; ')}`, '');
		if (e.reads.length) lines.push(`Reads back: ${e.reads.join(', ')}`, '');
		for (const [path, list] of Object.entries(e.members)) lines.push(`Members read${path ? ` on ${path}` : ''}: ${list.join(', ')}`, '');
		for (const spec of specs.get(e) ?? []) {
			lines.push(`- ${spec.site.file}:${spec.site.line}${spec.site.routes?.length ? ` on ${spec.site.routes.join(', ')}` : ''}`);
			for (const m of spec.mustSee) lines.push(`  - must: ${m}`);
			for (const j of spec.journeys) lines.push(`  - journey "${j.journey}" on ${j.route}: ${j.expect.join(' / ')}`);
			if (recorded && !spec.journeys.length) lines.push('  - not exercised by any recorded journey: only the static checks (rendered, css, visual, a11y) see this site');
		}
		lines.push('');
	}
	return `${lines.join('\n')}\n`;
}
