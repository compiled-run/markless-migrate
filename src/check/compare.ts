import { sameContentType } from './assets.ts';
import { compareA11y } from './a11y.ts';
import { HINTS, seoHint } from './hints.ts';
import { failureElements, failureOccurrence } from './locate.ts';
import { compareI18n } from './i18n.ts';
import { describe, matchElements } from './match.ts';
import { compareNetwork, contractLines } from './network.ts';
import type { ClientFact, NondeterminismFact } from './source-facts.ts';
import { at as sourceAt } from './source-facts.ts';
import { diffFields, diffLines, fieldTemplates, lineTemplates, type LineDiff } from './noise.ts';
import type { AssetRecord, Box, Dimension, ElementSnapshot, Failure, HttpCapture, NoiseReport, PageCapture, RouteCapture, RouteResult, Shot } from './types.ts';
import { DIMENSIONS } from './types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from './visual.ts';

const LIMIT = 20;
// lang and dir are compared as internationalisation, not SEO.
const LOCALE_KEYS = new Set(['html:lang', 'html:dir']);
// font-family names are compared by the font files that render, so generated family names do not differ.
const RENDERED_ELSEWHERE = new Set(['font-family']);
const WEIGHT_SLACK_BYTES = 1024;
// Measured on the Next fixture: run-at-load bytes of one build moved by 2,016 bytes (1.07%) between loads that two OLD loads did not see.
const EXECUTED_SLACK_RATIO = 0.02;

export interface Probe {
	readonly status: number;
	readonly contentType: string;
}

export function uniqueAssets(capture: RouteCapture): AssetRecord[] {
	const seen = new Map<string, AssetRecord>();
	for (const page of Object.values(capture.pages)) for (const asset of page.assets) if (!seen.has(asset.url)) seen.set(asset.url, asset);
	return [...seen.values()];
}

// Same-origin, unfingerprinted OLD assets the NEW page did not request itself, so the runner must fetch them.
export function assetsToProbe(oldA: RouteCapture, next: RouteCapture): string[] {
	const requested = new Set(uniqueAssets(next).map((a) => a.url));
	return uniqueAssets(oldA)
		.filter((a) => a.url.startsWith('/') && !a.fingerprinted && !requested.has(a.url))
		.map((a) => a.url);
}

function fmt(value: string | undefined): string {
	return value === undefined ? '(absent)' : JSON.stringify(value);
}

// How many identical lines come before this one, so the failure can name the right one of several elements written alike.
const occurrence = (lines: readonly string[] | undefined, index: number | undefined) => (lines && index !== undefined ? lines.slice(0, index).filter((l) => l === lines[index]).length : undefined);

function lineFailures(route: string, dimension: Dimension, check: string, viewport: string, diff: LineDiff, hint: string, lines?: { readonly old: readonly string[]; readonly new: readonly string[] }): Failure[] {
	const out: Failure[] = [];
	const note = (f: Failure, old?: number, next?: number) => {
		const o = occurrence(lines?.old, old);
		const n = occurrence(lines?.new, next);
		if (o || n) failureOccurrence.set(f, { ...(o !== undefined ? { old: o } : {}), ...(n !== undefined ? { new: n } : {}) });
		out.push(f);
	};
	diff.changed.forEach((c, k) => note({ route, dimension, check, viewport, expected: c.expected, actual: c.actual, hint }, diff.at?.changed[k]?.expected, diff.at?.changed[k]?.actual));
	diff.missing.forEach((line, k) => note({ route, dimension, check, viewport, expected: line, actual: '(absent)', hint }, diff.at?.missing[k]));
	diff.unexpected.forEach((line, k) => note({ route, dimension, check, viewport, expected: '(absent)', actual: line, hint }, undefined, diff.at?.unexpected[k]));
	return out;
}

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function noisyTextBoxes(a: readonly ElementSnapshot[], others: readonly (readonly ElementSnapshot[])[]): Box[] {
	const boxes: Box[] = [];
	for (const b of others) {
		for (const [i, j] of matchElements(a, b)) {
			if (a[i]!.text !== b[j]!.text || a[i]!.name !== b[j]!.name) boxes.push(a[i]!.box, b[j]!.box);
		}
	}
	return boxes;
}

// Per element of the first OLD load: the properties that differed in any other OLD load. Elements some load lacked are absent.
export function noisyStyles(a: readonly ElementSnapshot[], others: readonly (readonly ElementSnapshot[])[]): Map<number, Set<string>> {
	const noisy = new Map<number, Set<string>>(a.map((_, i) => [i, new Set<string>()]));
	for (const b of others) {
		const pairs = matchElements(a, b);
		for (const i of [...noisy.keys()]) {
			const j = pairs.get(i);
			if (j === undefined) {
				noisy.delete(i);
				continue;
			}
			const sa = a[i]!.style;
			const sb = b[j]!.style;
			for (const prop of Object.keys(sa)) if (sa[prop] !== sb[prop]) noisy.get(i)!.add(prop);
		}
	}
	return noisy;
}

// The font of an element's text, or, when its text sits in child elements (a span inside a button), of the first descendant with text.
function textFont(elements: readonly ElementSnapshot[], el: ElementSnapshot): string | undefined {
	if (el.font || !el.chain) return el.font;
	return elements.find((e) => e.font && e.chain?.startsWith(`${el.chain}>`))?.font;
}

// The words a font check is about: the element's own visible text before its accessible name (sr-only "Go to page 1" plus "1" reads "Go to page 11").
const describeText = (el: ElementSnapshot) => describe(el.text ? { ...el, name: el.text } : el);

export function fontFailures(route: string, viewport: string, oldA: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const stable = new Set(oldA.elements.map((_, i) => i));
	for (const other of others) {
		const pairs = matchElements(oldA.elements, other.elements);
		for (const i of stable) if (oldA.elements[i]!.font !== other.elements[pairs.get(i) ?? -1]?.font) stable.delete(i);
	}
	const groups = new Map<string, { expected: string; actual: string; elements: ElementSnapshot[] }>();
	for (const [i, j] of matchElements(oldA.elements, next.elements)) {
		const expected = oldA.elements[i]!;
		const font = textFont(next.elements, next.elements[j]!);
		if (!stable.has(i) || !expected.font || expected.font === font) continue;
		const actual = font ?? '(no text)';
		const key = `${expected.font}\n${actual}`;
		const group = groups.get(key) ?? { expected: expected.font, actual, elements: [] };
		group.elements.push(expected);
		groups.set(key, group);
	}
	return [...groups.values()].slice(0, LIMIT).map((g) => {
		const failure: Failure = {
			route,
			dimension: 'assets',
			check: `rendered font of ${describeText(g.elements[0]!)}${g.elements.length > 1 ? ` and ${g.elements.length - 1} more elements` : ''}`,
			viewport,
			expected: g.expected,
			actual: g.actual,
			hint: HINTS.fonts,
		};
		failureElements.set(failure, { old: g.elements[0]! });
		return failure;
	});
}

/** The OLD element and properties behind each default computed-style failure, so the runner can name the rule. */
export const cssTargets = new WeakMap<Failure, { element: ElementSnapshot; props: readonly string[] }>();

function cssFailures(route: string, viewport: string, oldA: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const noisy = noisyStyles(oldA.elements, others.map((o) => o.elements));
	const failures: Failure[] = [];
	let extra = 0;
	for (const [i, j] of matchElements(oldA.elements, next.elements)) {
		const skip = noisy.get(i);
		if (!skip) continue;
		const expected = oldA.elements[i]!;
		const actual = next.elements[j]!;
		const props = Object.keys(expected.style).filter((prop) => !skip.has(prop) && !RENDERED_ELSEWHERE.has(prop) && expected.style[prop] !== actual.style[prop]);
		if (!props.length) continue;
		if (failures.length >= LIMIT) {
			extra++;
			continue;
		}
		const failure: Failure = {
			route,
			dimension: 'css',
			check: `computed style of ${describe(expected)}`,
			viewport,
			expected: props.map((p) => `${p}: ${expected.style[p]}`).join('; '),
			actual: props.map((p) => `${p}: ${actual.style[p] ?? '(unset)'}`).join('; '),
			hint: HINTS.css,
		};
		cssTargets.set(failure, { element: expected, props });
		failureElements.set(failure, { old: expected, new: actual });
		failures.push(failure);
	}
	if (extra) failures.push({ route, dimension: 'css', check: 'computed styles', viewport, expected: '', actual: `${extra} more elements differ`, hint: HINTS.css });
	return failures;
}

/** Elements whose text still changed between OLD loads, and why; with freezing on, what is left comes from the server or from timers. */
export function noiseReport(olds: readonly RouteCapture[], frozen: boolean, sources: readonly NondeterminismFact[] = []): NoiseReport {
	const [oldA, ...others] = olds;
	const found = new Map<string, { viewports: string[]; why: string }>();
	const unpinned = sources.filter((s) => s.side !== 'client').slice(0, 3);
	const suspects = unpinned.length ? `; sources the old app's code has that freezing cannot reach: ${unpinned.map((s) => `${sourceAt(s)} (${s.what ?? s.kind})`).join(', ')}` : '';
	const why = frozen
		? `changed between OLD loads although the browser clock, randomness, timezone and locale were frozen and trackers blocked, so it comes from the server (time, data, an experiment) or from a timer${suspects}; the noise baseline allows it to vary only where the OLD loads differed`
		: 'changed between OLD loads with freezing off; the noise baseline allows it to vary only where the OLD loads differed';
	for (const [viewport, a] of Object.entries(oldA?.pages ?? {})) {
		for (const other of others) {
			const b = other.pages[viewport];
			if (!b) continue;
			for (const [i, j] of matchElements(a.elements, b.elements)) {
				if (a.elements[i]!.text === b.elements[j]!.text && a.elements[i]!.name === b.elements[j]!.name) continue;
				const element = describe(a.elements[i]!);
				const entry = found.get(element) ?? { viewports: [], why };
				if (!entry.viewports.includes(viewport)) entry.viewports.push(viewport);
				found.set(element, entry);
			}
		}
	}
	const blocked: Record<string, number> = {};
	for (const page of Object.values(oldA?.pages ?? {}).slice(0, 1)) for (const [host, n] of Object.entries(page.blocked ?? {})) blocked[host] = (blocked[host] ?? 0) + n;
	return { noisy: [...found].map(([element, e]) => ({ viewport: e.viewports.join(', '), element, why: e.why })), blocked };
}

/** Status, redirect chain and content type; what varied between OLD loads may vary. */
export function httpFailures(route: string, olds: readonly HttpCapture[], next: HttpCapture): Failure[] {
	const failures: Failure[] = [];
	const oldA = olds[0]!;
	const others = olds.length > 1 ? olds.slice(1) : [oldA];
	const chain = (c: HttpCapture) => Object.fromEntries(c.chain.map((hop, i) => [`hop ${i + 1}`, `${hop.status} ${hop.url}`]));
	for (const d of diffFields(fieldTemplates(chain(oldA), ...others.map(chain)), chain(next))) {
		const last = d.key === `hop ${oldA.chain.length}` && oldA.chain.length === next.chain.length;
		failures.push({ route, dimension: 'http', check: last ? 'status' : `redirect chain ${d.key}`, expected: d.expected ?? '(absent)', actual: d.actual ?? '(absent)', hint: last ? HINTS.status : HINTS.redirects });
	}
	if (others.every((o) => o.contentType === oldA.contentType) && oldA.contentType !== next.contentType) {
		failures.push({ route, dimension: 'http', check: 'content-type', expected: oldA.contentType, actual: next.contentType, hint: HINTS.contentType });
	}
	return failures;
}

export function compareRoute(route: string, olds: readonly RouteCapture[], next: RouteCapture, probes: ReadonlyMap<string, Probe>, clients: readonly ClientFact[] = []): RouteResult {
	const oldA = olds[0]!;
	const others = olds.length > 1 ? olds.slice(1) : [oldA];
	const failures: Failure[] = [];
	const visualDiffs: { viewport: string; png: Buffer }[] = [];
	const shots: Shot[] = [];

	failures.push(...httpFailures(route, olds.map((o) => o.http), next.http));

	for (const [viewport, a] of Object.entries(oldA.pages)) {
		const bs = others.map((o) => o.pages[viewport]!);
		const n = next.pages[viewport];
		if (!n) continue;
		failures.push(...lineFailures(route, 'rendered', 'accessibility tree', viewport, diffLines(lineTemplates(a.aria, ...bs.map((b) => b.aria)), n.aria), HINTS.aria, { old: a.aria, new: n.aria }).slice(0, LIMIT));
		failures.push(...lineFailures(route, 'rendered', 'visible text', viewport, diffLines(lineTemplates(a.text, ...bs.map((b) => b.text)), n.text), HINTS.text, { old: a.text, new: n.text }).slice(0, LIMIT));

		const noise = visualNoise(a.screenshot, bs.map((b) => b.screenshot), noisyTextBoxes(a.elements, bs.map((b) => b.elements)));
		const diff = compareScreenshots(a.screenshot, n.screenshot, noise);
		shots.push({ label: viewport, viewport, old: a.screenshot, new: n.screenshot, diff: diff.png, regions: visuallyDifferent(diff) ? diff.regions : [], ok: !visuallyDifferent(diff) });
		if (visuallyDifferent(diff)) {
			const r = diff.region;
			const band = r && { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 24) };
			const nearest = band ? n.elements.filter((el) => overlaps(el.box, band)).sort((x, y) => x.box.width * x.box.height - y.box.width * y.box.height).slice(0, 2) : [];
			const near = nearest.map(describe);
			const where = r ? `${diff.differing} pixels (${((diff.differing / diff.area) * 100).toFixed(2)}%) differ in x=${r.x}..${r.x + r.width}, y=${r.y}..${r.y + r.height}, first near ${near.join(', ') || 'no element'}` : 'no pixel differs in the shared area';
			if (diff.sizeMismatch) {
				failures.push({ route, dimension: 'visual', check: 'page size', viewport, expected: diff.sizeMismatch.expected, actual: `${diff.sizeMismatch.actual}; ${where}`, hint: HINTS.visualSize });
			} else {
				const failure: Failure = { route, dimension: 'visual', check: 'screenshot', viewport, expected: 'same pixels outside the noise mask', actual: where, hint: HINTS.visual };
				if (nearest[0]) failureElements.set(failure, { new: nearest[0] });
				failures.push(failure);
			}
			if (diff.png) visualDiffs.push({ viewport, png: diff.png });
		}

		failures.push(...cssFailures(route, viewport, a, bs, n));
		if (a.a11y && n.a11y) failures.push(...compareA11y(route, viewport, a.a11y, bs.flatMap((b) => (b.a11y ? [b.a11y] : [])), n.a11y));

		a.images.forEach((img, i) => {
			const other = n.images[i];
			if (bs.some((b) => !b.images[i] || b.images[i]!.naturalWidth !== img.naturalWidth || b.images[i]!.broken !== img.broken)) return;
			const expected = img.broken ? 'broken' : `${img.naturalWidth}x${img.naturalHeight}`;
			const actual = !other ? '(absent)' : other.broken ? 'broken' : `${other.naturalWidth}x${other.naturalHeight}`;
			if (expected !== actual) failures.push({ route, dimension: 'assets', check: `image #${i + 1} ${img.src}`, viewport, expected, actual, hint: HINTS.image });
		});
		failures.push(...fontFailures(route, viewport, a, bs, n));
	}

	const desktop = Object.keys(oldA.pages)[0]!;
	const withoutLocale = (seo: Readonly<Record<string, string>>) => Object.fromEntries(Object.entries(seo).filter(([key]) => !LOCALE_KEYS.has(key)));
	const seo = diffFields(fieldTemplates(withoutLocale(oldA.pages[desktop]!.seo), ...others.map((o) => withoutLocale(o.pages[desktop]!.seo))), withoutLocale(next.pages[desktop]?.seo ?? {}));
	if (next.pages[desktop]) failures.push(...compareI18n(route, desktop, oldA.pages[desktop]!, others.map((o) => o.pages[desktop]!), next.pages[desktop]!));
	for (const d of seo) failures.push({ route, dimension: 'seo', check: d.key, expected: fmt(d.expected), actual: fmt(d.actual), hint: seoHint(d.key) });

	const stableIn = others.map((o) => new Set(uniqueAssets(o).map((a) => a.url)));
	const newAssets = new Map(uniqueAssets(next).map((a) => [a.url, a]));
	const reported = new Set<string>();
	for (const asset of uniqueAssets(oldA)) {
		if (!asset.url.startsWith('/') || asset.fingerprinted || stableIn.some((set) => !set.has(asset.url)) || asset.status >= 400) continue;
		const found = newAssets.get(asset.url) ?? probes.get(asset.url);
		if (!found || found.status >= 400) {
			reported.add(asset.url);
			failures.push({ route, dimension: 'assets', check: `${asset.type} ${asset.url}`, expected: `${asset.status} ${asset.contentType}`, actual: found ? `${found.status} ${found.contentType}` : 'not served', hint: HINTS.assetMissing });
		} else if (!sameContentType(found.contentType, asset.contentType)) {
			failures.push({ route, dimension: 'assets', check: `${asset.type} ${asset.url}`, expected: asset.contentType, actual: found.contentType, hint: HINTS.assetType });
		}
	}
	for (const asset of newAssets.values()) {
		if (asset.status >= 400 && !reported.has(asset.url)) {
			failures.push({ route, dimension: 'assets', check: `${asset.type} ${asset.url}`, expected: 'a successful response', actual: `${asset.status}`, hint: HINTS.assetBroken });
		}
	}
	for (const [url, size] of Object.entries(oldA.pages[desktop]!.decoded)) {
		const other = next.pages[desktop]?.decoded[url];
		if (other && (other.width !== size.width || other.height !== size.height)) {
			failures.push({ route, dimension: 'assets', check: `decoded size of ${url}`, expected: `${size.width}x${size.height}`, actual: `${other.width}x${other.height}`, hint: HINTS.assetDimensions });
		}
	}

	failures.push(...compareNetwork(route, olds.map((o) => o.pages[desktop]?.network), next.pages[desktop]?.network, oldA.origin, next.origin, clients));
	const oldNet = oldA.pages[desktop]?.network;
	const newNet = next.pages[desktop]?.network;
	const network = oldNet && newNet ? { old: contractLines(oldNet, oldA.origin), new: contractLines(newNet, next.origin), server: { old: oldNet.server, new: newNet.server } } : undefined;

	const wa = oldA.pages[desktop]!.weight;
	const wn = next.pages[desktop]?.weight ?? { downloaded: 0, source: 0, executed: 0, scripts: [] };
	for (const key of ['downloaded', 'executed'] as const) {
		const slack = key === 'executed' ? Math.max(WEIGHT_SLACK_BYTES, Math.round(wa[key] * EXECUTED_SLACK_RATIO)) : WEIGHT_SLACK_BYTES;
		const allowed = wa[key] + Math.max(...others.map((o) => Math.abs(wa[key] - o.pages[desktop]!.weight[key]))) + slack;
		if (wn[key] > allowed) {
			const oldUrls = new Set(wa.scripts.map((s) => s.url));
			const only = wn.scripts.filter((s) => !oldUrls.has(s.url)).sort((x, y) => y[key === 'downloaded' ? 'bytes' : 'executed'] - x[key === 'downloaded' ? 'bytes' : 'executed']).slice(0, 3);
			failures.push({
				route,
				dimension: 'weight',
				check: key === 'downloaded' ? 'JavaScript downloaded' : 'JavaScript run at load',
				expected: `at most ${allowed} bytes (old: ${wa[key]})`,
				actual: `${wn[key]} bytes${only.length ? `; new-only scripts: ${only.map((s) => `${s.url} (${key === 'downloaded' ? s.bytes : s.executed} B)`).join(', ')}` : ''}`,
				hint: HINTS.weight,
			});
		}
	}

	return withFailures({ route, ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: { downloaded: wa.downloaded, source: wa.source, executed: wa.executed }, new: { downloaded: wn.downloaded, source: wn.source, executed: wn.executed } }, visualDiffs, shots, ...(network ? { network } : {}) }, failures);
}

export function withFailures(result: RouteResult, failures: readonly Failure[], extra: Partial<Pick<RouteResult, 'shots' | 'states' | 'journeys' | 'coverage' | 'noise' | 'writes'>> = {}): RouteResult {
	const failed = new Set(failures.map((f) => f.dimension));
	const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, failed.has(d) ? 'fail' : 'pass'])) as Record<Dimension, 'pass' | 'fail'>;
	return { ...result, ...extra, ok: failures.length === 0, dimensions, failures };
}
