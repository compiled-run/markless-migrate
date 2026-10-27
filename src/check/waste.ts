// First-click waste: of the bytes a page downloaded and the code it ran before its first click answered, what the answer
// did not need, attributed through source maps to the package, library port or module that carried it.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { APP_PARTS_DIR, PARTS_REGISTRIES } from '../convert/parts.ts';
import { mapFor } from './sourcemap.ts';
import { networkRun, type CoverageEntry, type NetworkRun, type NetworkRunOptions, type RunCapture } from './slow-network.ts';
import { NETWORK_PROFILES } from './throttle.ts';

/** The control waste clicks unless told: the first unselected tab or closed disclosure, as network clicks, but never a link, which would leave the page. */
export const WASTE_CONTROL = '[role="tab"][aria-selected="false"]:visible, [aria-expanded="false"]:visible:not(a[href])';
/** Above this much JavaScript (brotli) downloaded before the first click answers, the page is warned about. */
export const DEFAULT_JS_BUDGET = 60_000;
export const DEFAULT_WASTE_PROFILE = 'regular-3g';
/** A waste run gives up waiting for the answer after this long and reports what had downloaded and run by then. */
export const WASTE_TIMEOUT_MS = 60_000;
const NEVER = 0;
const IN_FUNCTION = 1;
const TOP_LEVEL = 2;

export type OwnerKind = 'framework' | 'library port' | 'parts registry' | 'package' | 'page' | 'app' | 'generated' | 'inline script' | 'unmapped' | 'file';

/** Who a piece of shipped code belongs to: a package, one of convert's library ports, the app's own code, a served file with no source map, or the part of a mapped file its map leaves out. */
export interface Owner {
	readonly kind: OwnerKind;
	readonly name: string;
}

/** Bytes of one owner's code, in characters of the served script (one byte each for minified ASCII). */
export interface Share {
	readonly bytes: number;
	/** The owner's share of its files' brotli size, in proportion to its bytes in each. */
	readonly brotli: number;
	/** Ran inside a function: real work. */
	readonly ranInFunctions: number;
	/** Ran only as a module's top-level code: definitions, tables and registries evaluated as the script loaded. */
	readonly ranAtTopLevel: number;
	readonly neverRan: number;
	readonly neverRanBrotli: number;
}

export interface WasteModule extends Share {
	readonly module: string;
}

export interface WasteItem extends Owner, Share {
	/** The served files the owner's code came in. */
	readonly files: readonly string[];
	/** Its largest modules by bytes that never ran, at most 8. */
	readonly modules: readonly WasteModule[];
}

/** A non-script block in the HTML (an import map, serialized state): downloaded with the page, never run as code. */
export interface InlineData {
	readonly name: string;
	readonly bytes: number;
	readonly brotli: number;
}

export interface WasteReport {
	readonly url: string;
	readonly profile: string;
	readonly control: string;
	/** ms after navigation start. */
	readonly answered?: number;
	/** No control showed: what the page downloaded and ran by the end of its load is measured instead. */
	readonly noControl?: boolean;
	/** The control never answered (why): what the page downloaded and ran by the time the run gave up is measured instead. */
	readonly unanswered?: string;
	readonly error?: string;
	/** Scripts with a source map; the others are attributed to their file. */
	readonly mapped: number;
	readonly scripts: number;
	readonly js: Share;
	readonly items: readonly WasteItem[];
	/** The items summed by kind: all library ports together, all of the framework. */
	readonly kinds: readonly (Share & { readonly kind: OwnerKind; readonly owners: number })[];
	readonly inlineData: readonly InlineData[];
	/** Bytes over the wire before the answer, by request type. */
	readonly downloaded: Readonly<Record<string, number>>;
	readonly budget: number;
	/** How long measuring the page took. */
	readonly ms: number;
}

export function brotli(text: string): number {
	if (!text) return 0;
	return brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: text.length } }).length;
}

/** Per character of a script: never ran, ran inside a function, or ran only as the script's top-level code. V8 lists a function's whole range first and its blocks after, so the innermost range decides. */
export function ranMask(entry: CoverageEntry, length: number): Uint8Array {
	const mask = new Uint8Array(length);
	const ranges = entry.functions
		.flatMap((f) => {
			const first = f.ranges[0];
			const top = Boolean(first && first.startOffset <= 0 && first.endOffset >= length);
			return f.ranges.map((r) => ({ ...r, top }));
		})
		.sort((a, b) => b.endOffset - b.startOffset - (a.endOffset - a.startOffset));
	for (const r of ranges) mask.fill(r.count > 0 ? (r.top ? TOP_LEVEL : IN_FUNCTION) : NEVER, Math.max(0, r.startOffset), Math.min(length, r.endOffset));
	return mask;
}

const B64 = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));

/** The generated line and column of each source-map segment, in order, and the index of its source (-1 for none). */
export function decodeMappings(mappings: string): { line: number; column: number; source: number }[] {
	const out: { line: number; column: number; source: number }[] = [];
	let line = 0;
	let source = 0;
	let i = 0;
	const fields: number[] = [];
	let column = 0;
	while (i < mappings.length) {
		const c = mappings[i]!;
		if (c === ';') {
			line++;
			column = 0;
			i++;
			continue;
		}
		if (c === ',') {
			i++;
			continue;
		}
		fields.length = 0;
		while (i < mappings.length && mappings[i] !== ',' && mappings[i] !== ';') {
			let value = 0;
			let shift = 0;
			let digit: number;
			do {
				digit = B64.get(mappings[i++]!) ?? 0;
				value += (digit & 31) << shift;
				shift += 5;
			} while (digit & 32);
			fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
		}
		column += fields[0] ?? 0;
		if (fields.length >= 4) source += fields[1]!;
		out.push({ line, column, source: fields.length >= 4 ? source : -1 });
	}
	return out;
}

/** Who a source-map source belongs to, and its path within that owner. */
export function ownerOf(source: string): { owner: Owner; module: string } {
	const id = source.split('?')[0]!;
	if (id.startsWith('\0') || /^virtual:/.test(id)) return { owner: { kind: 'generated', name: id.replace(/^\0/, '') }, module: id.replace(/^\0/, '') };
	const path = id.replace(/^[a-z][\w+.-]*:\/*(\[project\]\/)?/i, '').replace(/^(\.\.?\/)+/, '');
	const deps = path.lastIndexOf('node_modules/');
	if (deps >= 0) {
		const rest = path.slice(deps + 'node_modules/'.length).split('/');
		const name = rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!;
		const module = rest.slice(name.split('/').length).join('/');
		return { owner: { kind: name.startsWith('@markless/') ? 'framework' : 'package', name }, module };
	}
	const parts = `/${path}`.lastIndexOf(`/${APP_PARTS_DIR}/`);
	if (parts >= 0) {
		const rel = path.slice(parts + APP_PARTS_DIR.length + 1);
		// An app converted before registries were per page has one, registry.ts.
		if (rel.startsWith(`${PARTS_REGISTRIES}/`) || rel === 'registry.ts') return { owner: { kind: 'parts registry', name: `${APP_PARTS_DIR}/${rel}` }, module: rel };
		return { owner: { kind: 'library port', name: `${APP_PARTS_DIR}/${rel.replace(/\.[cm]?[jt]sx?$|\.tsrx$/, '')}` }, module: rel };
	}
	if (/(^|\/)pages\//.test(path)) return { owner: { kind: 'page', name: path.slice(path.search(/(^|\/)pages\//)).replace(/^\//, '') }, module: path };
	return { owner: { kind: 'app', name: path }, module: path };
}

interface SourceMapPayload {
	readonly sources: readonly (string | null)[];
	readonly sourceRoot?: string;
	readonly mappings: string;
}

/** A script as served, what of it ran, and its source map. */
export interface ServedScript {
	readonly file: string;
	readonly text: string;
	/** undefined when the script was downloaded but never evaluated. */
	readonly mask?: Uint8Array;
	readonly map?: SourceMapPayload;
	/** Who owns it when it has no source map. */
	readonly owner?: Owner;
}

interface Tally {
	bytes: number;
	brotli: number;
	fn: number;
	top: number;
	never: number;
	neverBrotli: number;
}

const tally = (): Tally => ({ bytes: 0, brotli: 0, fn: 0, top: 0, never: 0, neverBrotli: 0 });
const share = (t: Tally): Share => ({ bytes: t.bytes, brotli: Math.round(t.brotli), ranInFunctions: t.fn, ranAtTopLevel: t.top, neverRan: t.never, neverRanBrotli: Math.round(t.neverBrotli) });

/** Attributes each served script's characters to the owners its source map names, split by what ran. */
export function attribute(scripts: readonly ServedScript[]): { items: WasteItem[]; js: Share } {
	const owners = new Map<string, { owner: Owner; total: Tally; files: Set<string>; modules: Map<string, Tally> }>();
	const js = tally();
	for (const script of scripts) {
		const length = script.text.length;
		if (!length) continue;
		const ratio = brotli(script.text) / length;
		// Running counts of never-ran and top-level characters, so any slice is counted in constant time.
		const never = new Int32Array(length + 1);
		const top = new Int32Array(length + 1);
		for (let i = 0; i < length; i++) {
			const v = script.mask ? script.mask[i]! : NEVER;
			never[i + 1] = never[i]! + (v === NEVER ? 1 : 0);
			top[i + 1] = top[i]! + (v === TOP_LEVEL ? 1 : 0);
		}
		const add = (owner: Owner, module: string, from: number, to: number) => {
			if (to <= from) return;
			const n = never[to]! - never[from]!;
			const t = top[to]! - top[from]!;
			const key = `${owner.kind}\u0000${owner.name}`;
			const entry = owners.get(key) ?? owners.set(key, { owner, total: tally(), files: new Set(), modules: new Map() }).get(key)!;
			entry.files.add(script.file);
			for (const into of [entry.total, entry.modules.get(module) ?? entry.modules.set(module, tally()).get(module)!, js]) {
				into.bytes += to - from;
				into.brotli += (to - from) * ratio;
				into.never += n;
				into.neverBrotli += n * ratio;
				into.top += t;
				into.fn += to - from - n - t;
			}
		};
		if (!script.map) {
			add(script.owner ?? { kind: 'file', name: script.file }, script.file, 0, length);
			continue;
		}
		const unmapped: Owner = { kind: 'unmapped', name: script.file };
		const lineStarts = [0];
		for (let i = 0; i < length; i++) if (script.text.charCodeAt(i) === 10) lineStarts.push(i + 1);
		const sources = script.map.sources.map((s) => (s === null ? undefined : ownerOf(`${script.map!.sourceRoot ?? ''}${s}`)));
		const segments = decodeMappings(script.map.mappings);
		let at = 0;
		let current: { owner: Owner; module: string } = { owner: unmapped, module: script.file };
		for (const segment of segments) {
			const offset = Math.min(length, (lineStarts[segment.line] ?? length) + segment.column);
			if (offset > at) add(current.owner, current.module, at, offset);
			at = Math.max(at, offset);
			current = (segment.source >= 0 && sources[segment.source]) || { owner: unmapped, module: script.file };
		}
		add(current.owner, current.module, at, length);
	}
	const items = [...owners.values()].map(({ owner, total, files, modules }): WasteItem => ({
		...owner,
		...share(total),
		files: [...files],
		modules: [...modules]
			.map(([module, t]) => ({ module, ...share(t) }))
			.sort((a, b) => b.neverRan - a.neverRan || b.bytes - a.bytes)
			.slice(0, 8),
	}));
	items.sort((a, b) => b.neverRanBrotli - a.neverRanBrotli || b.bytes - a.bytes);
	return { items, js: share(js) };
}

const JS_TYPES = /^(|module|text\/javascript|application\/javascript|text\/ecmascript)$/i;

/** The page's inline scripts and other inline blocks: each with its opening tag's attributes and its text. */
export function inlineScripts(html: string): { attrs: string; text: string; js: boolean }[] {
	const out: { attrs: string; text: string; js: boolean }[] = [];
	for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
		const attrs = m[1]!.trim();
		if (/\bsrc\s*=/i.test(attrs)) continue;
		const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? '';
		out.push({ attrs, text: m[2]!, js: JS_TYPES.test(type) });
	}
	return out;
}

const tagName = (attrs: string) => `<script${attrs ? ` ${attrs.replace(/=("[^"]{40})[^"]*"/g, '=$1…"')}` : ''}>`;

/** Where a served script's source map is: beside it on disk under `dir` (a build output), else as the site serves it. */
export async function mapOf(url: string, text: string, dir?: string): Promise<SourceMapPayload | undefined> {
	const valid = (p: unknown): SourceMapPayload | undefined => (p && typeof p === 'object' && Array.isArray((p as SourceMapPayload).sources) && typeof (p as SourceMapPayload).mappings === 'string' ? (p as SourceMapPayload) : undefined);
	if (dir) {
		const path = decodeURIComponent(new URL(url).pathname);
		for (const root of ['', 'static', 'public', '.vercel/output/static', '.output/public']) {
			const found = await readFile(join(dir, root, `${path}.map`), 'utf8').catch(() => undefined);
			if (found) {
				try {
					return valid(JSON.parse(found));
				} catch {
					return undefined;
				}
			}
		}
	}
	const map = await mapFor(url, text).catch(() => undefined);
	return valid(map?.payload);
}

/** The waste report of one captured run: everything the page downloaded before the answer, what of its code ran, and who owns the rest. */
export async function wasteOf(url: string, run: NetworkRun, options: { profile: string; control: string; maps?: string; budget?: number; ms?: number; lookupMap?: typeof mapOf }): Promise<WasteReport> {
	const lookup = options.lookupMap ?? mapOf;
	const capture: RunCapture = run.capture ?? { scripts: [], coverage: [] };
	const unanswered = run.answered === undefined && !run.noControl && run.capture ? run.error : undefined;
	const cutoff = run.answered ?? (run.noControl || unanswered ? Infinity : -1);
	const before = run.requests.filter((r) => r.start < cutoff);
	const downloaded: Record<string, number> = {};
	for (const r of before) downloaded[r.type] = (downloaded[r.type] ?? 0) + r.bytes;
	const coverage = new Map<string, CoverageEntry[]>();
	for (const entry of capture.coverage) coverage.set(entry.url, [...(coverage.get(entry.url) ?? []), entry]);
	const served: ServedScript[] = [];
	let mapped = 0;
	for (const script of capture.scripts) {
		if (script.start >= cutoff) continue;
		const entries = coverage.get(script.url) ?? [];
		const entry = entries.find((e) => e.source === script.text) ?? entries[0];
		const text = entry?.source ?? script.text;
		const map = await lookup(script.url, text, options.maps);
		if (map) mapped++;
		served.push({ file: new URL(script.url).pathname, text, ...(entry ? { mask: ranMask(entry, text.length) } : {}), ...(map ? { map } : {}) });
	}
	const inline = capture.document ? inlineScripts(capture.document.text) : [];
	const pageEntries = coverage.get(capture.document?.url ?? url) ?? [];
	for (const block of inline.filter((b) => b.js && b.text.trim())) {
		const entry = pageEntries.find((e) => e.source === block.text);
		served.push({ file: tagName(block.attrs), text: block.text, owner: { kind: 'inline script', name: tagName(block.attrs) }, ...(entry ? { mask: ranMask(entry, block.text.length) } : {}) });
	}
	const { items, js } = attribute(served);
	const kinds = new Map<OwnerKind, Tally & { owners: number }>();
	for (const item of items) {
		const k = kinds.get(item.kind) ?? kinds.set(item.kind, { ...tally(), owners: 0 }).get(item.kind)!;
		k.owners++;
		k.bytes += item.bytes;
		k.brotli += item.brotli;
		k.fn += item.ranInFunctions;
		k.top += item.ranAtTopLevel;
		k.never += item.neverRan;
		k.neverBrotli += item.neverRanBrotli;
	}
	const inlineData = inline.filter((b) => !b.js && b.text.trim()).map((b) => ({ name: tagName(b.attrs), bytes: b.text.length, brotli: brotli(b.text) }));
	return {
		url,
		profile: options.profile,
		control: options.control,
		...(run.answered !== undefined ? { answered: run.answered } : {}),
		...(run.noControl ? { noControl: true } : {}),
		...(unanswered ? { unanswered } : run.error ? { error: run.error } : {}),
		mapped,
		scripts: capture.scripts.filter((s) => s.start < cutoff).length,
		js,
		items,
		kinds: [...kinds].map(([kind, t]) => ({ kind, owners: t.owners, ...share(t) })).sort((a, b) => b.neverRanBrotli - a.neverRanBrotli),
		inlineData: inlineData.sort((a, b) => b.brotli - a.brotli),
		downloaded,
		budget: options.budget ?? DEFAULT_JS_BUDGET,
		ms: options.ms ?? 0,
	};
}

export interface WasteOptions extends Pick<NetworkRunOptions, 'control' | 'timeoutMs' | 'hosts'> {
	/** Network profile to load the page over; default regular-3g. */
	readonly profile?: string;
	/** A build output holding the scripts' source maps, for a site that does not serve them. */
	readonly maps?: string;
	/** JS budget in bytes (brotli) downloaded before the answer. */
	readonly budget?: number;
}

/** One cold load of `url` in Chromium over a slow link, clicking its first control until it answers, and the waste report of it. */
export async function measureWaste(url: string, options: WasteOptions = {}): Promise<WasteReport> {
	const started = Date.now();
	const profileName = options.profile ?? DEFAULT_WASTE_PROFILE;
	const profile = NETWORK_PROFILES[profileName];
	if (!profile) throw new Error(`unknown network profile ${profileName}: one of ${Object.keys(NETWORK_PROFILES).join(', ')}`);
	const control = options.control ?? WASTE_CONTROL;
	const run = await networkRun(url, profile, 'chromium', { timeoutMs: WASTE_TIMEOUT_MS, ...options, control, capture: true, firstFrame: false, afterAnswerMs: 0 });
	return wasteOf(url, run, { profile: profileName, control, ...(options.maps ? { maps: options.maps } : {}), ...(options.budget !== undefined ? { budget: options.budget } : {}), ms: Date.now() - started });
}

export const kB = (n: number) => `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)} kB`;

/** Whether the page's JS before the answer is over its budget. */
export const overBudget = (report: WasteReport) => !report.error && report.js.brotli > report.budget;

export function wasteHeadline(report: WasteReport): string {
	if (report.error) return `first-click waste: not measured (${report.error})`;
	const when = report.noControl ? 'by the end of the load (no control to click)' : report.unanswered ? 'by the end of the run (the control never answered)' : `before the first click answered (${(report.answered! / 1000).toFixed(1)} s)`;
	return `first-click JS ${when}: ${kB(report.js.brotli)} brotli downloaded, ${kB(report.js.neverRanBrotli)} of it never ran; ${kB(report.js.bytes - report.js.neverRan)} of ${kB(report.js.bytes)} executed${overBudget(report) ? `; over the ${kB(report.budget)} budget` : ''}`;
}

/** The CLI lines for one page: the headline, the top offenders by brotli bytes that never ran, and the inline data. */
export function wasteLines(report: WasteReport, top = 8): string[] {
	const lines = [wasteHeadline(report)];
	if (report.error) return lines;
	if (report.unanswered) lines.push(`  ${report.unanswered}`);
	if (report.mapped < report.scripts) lines.push(`  ${report.scripts - report.mapped} of ${report.scripts} scripts had no source map: their code is named by file (pass --maps <build output> for modules)`);
	const kinds = report.kinds.filter((k) => k.neverRan > 0);
	if (kinds.length) lines.push(`  never ran, by kind (brotli): ${kinds.map((k) => `${k.kind}${k.owners > 1 ? ` (${k.owners})` : ''} ${kB(k.neverRanBrotli)}`).join(', ')}`);
	const offenders = report.items.filter((i) => i.neverRan > 0).slice(0, top);
	if (offenders.length) lines.push('  never ran before the answer (brotli downloaded / raw):');
	for (const item of offenders) lines.push(`    ${kB(item.neverRanBrotli).padStart(8)} / ${kB(item.neverRan).padStart(8)}  ${item.kind}: ${item.name}${item.modules.length > 1 && item.kind !== 'file' ? ` (${item.modules.slice(0, 3).map((m) => `${m.module} ${kB(m.neverRan)}`).join(', ')})` : ''}`);
	const evaluated = report.items.filter((i) => i.ranAtTopLevel >= 2_000 && i.ranInFunctions < i.ranAtTopLevel / 4).slice(0, 4);
	if (evaluated.length) lines.push(`  evaluated at load, barely called: ${evaluated.map((i) => `${i.name} ${kB(i.ranAtTopLevel)}`).join(', ')}`);
	const inline = [...report.items.filter((i) => i.kind === 'inline script').map((i) => ({ name: i.name, brotli: i.brotli })), ...report.inlineData].sort((a, b) => b.brotli - a.brotli);
	if (inline.length) lines.push(`  inline in the HTML (brotli): ${kB(inline.reduce((n, i) => n + i.brotli, 0))}: ${inline.slice(0, 5).map((d) => `${d.name} ${kB(d.brotli)}`).join(', ')}`);
	return lines;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The report's HTML section for one page. */
export function wasteHtml(report: WasteReport): string {
	if (report.error) return `<h4>First-click waste</h4><p>${esc(wasteHeadline(report))}</p>`;
	const rows = report.items
		.filter((i) => i.bytes >= 200)
		.slice(0, 40)
		.map((i) => `<tr><td>${esc(i.kind)}</td><td>${esc(i.name)}${i.modules.length > 1 ? `<br><small>${i.modules.slice(0, 5).map((m) => `${esc(m.module)} ${kB(m.neverRan)}`).join(', ')}</small>` : ''}</td><td>${kB(i.brotli)}</td><td>${kB(i.bytes)}</td><td>${kB(i.ranInFunctions)}</td><td>${kB(i.ranAtTopLevel)}</td><td><strong>${kB(i.neverRanBrotli)}</strong> / ${kB(i.neverRan)}</td><td><small>${i.files.slice(0, 3).map(esc).join('<br>')}</small></td></tr>`)
		.join('');
	const kinds = report.kinds.filter((k) => k.neverRan > 0).length ? `<p>Never ran, by kind (brotli / raw): ${report.kinds.filter((k) => k.neverRan > 0).map((k) => `${esc(k.kind)}${k.owners > 1 ? ` (${k.owners})` : ''} ${kB(k.neverRanBrotli)} / ${kB(k.neverRan)}`).join('; ')}</p>` : '';
	const data = report.inlineData.length ? `<p>Inline data in the HTML (brotli, raw): ${report.inlineData.map((d) => `${esc(d.name)} ${kB(d.brotli)}, ${kB(d.bytes)}`).join('; ')}</p>` : '';
	const maps = report.mapped < report.scripts ? `<p><small>${report.scripts - report.mapped} of ${report.scripts} scripts had no source map; their code is named by file.</small></p>` : '';
	return `<h4>First-click waste <small>${esc(wasteHeadline(report))}; one cold load in Chromium over ${esc(NETWORK_PROFILES[report.profile]?.label ?? report.profile)}, clicking ${esc(report.control)}; brotli is quality 11, an owner's share of a file's brotli in proportion to its bytes</small></h4>${maps}${report.unanswered ? `<p>${esc(report.unanswered)}</p>` : ''}${kinds}<table><thead><tr><th>Kind</th><th>Owner</th><th>Downloaded (brotli)</th><th>Raw</th><th>Ran in functions</th><th>Ran at top level only</th><th>Never ran (brotli / raw)</th><th>Files</th></tr></thead><tbody>${rows}</tbody></table>${data}`;
}

export interface WasteCheckOptions extends WasteOptions {
	/** Pages elsewhere (another framework's version of a page) measured once and shown beside the port's numbers. */
	readonly references?: readonly string[];
}

export interface WasteFlags {
	readonly 'no-waste'?: boolean;
	readonly 'waste-profile'?: string;
	readonly 'js-budget'?: string;
	readonly 'waste-maps'?: string;
	readonly reference?: readonly string[];
}

/** check's first-click waste options from its flags: on by default, off with --no-waste. */
export function wasteFlags(values: WasteFlags): { readonly options?: WasteCheckOptions; readonly error?: string } {
	if (values['no-waste']) {
		const given = (['waste-profile', 'js-budget', 'waste-maps', 'reference'] as const).filter((f) => values[f] !== undefined);
		return given.length ? { error: `--no-waste and --${given[0]} contradict each other` } : {};
	}
	const profile = values['waste-profile'];
	if (profile !== undefined && !NETWORK_PROFILES[profile]) return { error: `unknown --waste-profile ${profile}: one of ${Object.keys(NETWORK_PROFILES).join(', ')}` };
	const budget = values['js-budget'] === undefined ? undefined : Number(values['js-budget']) * 1000;
	if (budget !== undefined && !(budget > 0)) return { error: '--js-budget takes kB of brotli JavaScript, above 0' };
	const odd = values.reference?.find((url) => !URL.canParse(url));
	if (odd) return { error: `--reference takes a page URL: ${odd}` };
	return { options: { ...(profile ? { profile } : {}), ...(budget ? { budget } : {}), ...(values['waste-maps'] ? { maps: values['waste-maps'] } : {}), ...(values.reference?.length ? { references: values.reference } : {}) } };
}

/** One line for a reference page, to read beside a port's headline. */
export function referenceLine(report: WasteReport): string {
	if (report.error) return `${report.url}: not measured (${report.error})`;
	return `${report.url}: ${report.noControl ? 'no control to click' : report.unanswered ? 'the control never answered' : `answered at ${(report.answered! / 1000).toFixed(1)} s`}, ${kB(report.js.brotli)} brotli JS before it, ${kB(report.js.neverRanBrotli)} of it never ran`;
}

/** The end of check's summary: the pages over the JS budget (a warning, not red) and the reference pages. */
export function wasteSummaryLines(pages: readonly { readonly route: string; readonly waste: WasteReport }[], references: readonly WasteReport[] = []): string[] {
	if (!pages.length && !references.length) return [];
	const measured = pages.filter((p) => !p.waste.error);
	const over = measured.filter((p) => overBudget(p.waste)).sort((a, b) => b.waste.js.brotli - a.waste.js.brotli);
	const budget = pages[0]?.waste.budget ?? references[0]?.budget ?? DEFAULT_JS_BUDGET;
	const lines = [
		over.length
			? `First-click JS (a warning, not red): ${over.length} of ${measured.length} page${measured.length === 1 ? '' : 's'} measured download more than ${kB(budget)} of brotli JavaScript before their first click answers: ${over.map((p) => `${p.route} ${kB(p.waste.js.brotli)} (${kB(p.waste.js.neverRanBrotli)} never ran)`).join(', ')}.`
			: `First-click JS: ${measured.length} page${measured.length === 1 ? '' : 's'} measured, each within ${kB(budget)} of brotli JavaScript before its first click answers.`,
	];
	if (references.length) lines.push('Reference pages, measured the same way:', ...references.map((r) => `  ${referenceLine(r)}`));
	return lines;
}
