import { HINTS, seoHint } from './hints.ts';
import { describe, matchElements } from './match.ts';
import { diffFields, diffLines, fieldTemplates, lineTemplates, type LineDiff } from './noise.ts';
import type { AssetRecord, Box, Dimension, ElementSnapshot, Failure, PageCapture, RouteCapture, RouteResult, Shot } from './types.ts';
import { DIMENSIONS } from './types.ts';
import { compareScreenshots, visualNoise, visuallyDifferent } from './visual.ts';

const LIMIT = 20;
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

function lineFailures(route: string, dimension: Dimension, check: string, viewport: string, diff: LineDiff, hint: string): Failure[] {
	const out: Failure[] = [];
	for (const c of diff.changed) out.push({ route, dimension, check, viewport, expected: c.expected, actual: c.actual, hint });
	for (const line of diff.missing) out.push({ route, dimension, check, viewport, expected: line, actual: '(absent)', hint });
	for (const line of diff.unexpected) out.push({ route, dimension, check, viewport, expected: '(absent)', actual: line, hint });
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

function fontFailures(route: string, viewport: string, oldA: PageCapture, others: readonly PageCapture[], next: PageCapture): Failure[] {
	const stable = new Set(oldA.elements.map((_, i) => i));
	for (const other of others) {
		const pairs = matchElements(oldA.elements, other.elements);
		for (const i of stable) if (oldA.elements[i]!.font !== other.elements[pairs.get(i) ?? -1]?.font) stable.delete(i);
	}
	const groups = new Map<string, { expected: string; actual: string; elements: ElementSnapshot[] }>();
	for (const [i, j] of matchElements(oldA.elements, next.elements)) {
		const expected = oldA.elements[i]!;
		if (!stable.has(i) || !expected.font || expected.font === next.elements[j]!.font) continue;
		const actual = next.elements[j]!.font ?? '(no text)';
		const key = `${expected.font}\n${actual}`;
		const group = groups.get(key) ?? { expected: expected.font, actual, elements: [] };
		group.elements.push(expected);
		groups.set(key, group);
	}
	return [...groups.values()].slice(0, LIMIT).map((g) => ({
		route,
		dimension: 'assets',
		check: `rendered font of ${describe(g.elements[0]!)}${g.elements.length > 1 ? ` and ${g.elements.length - 1} more elements` : ''}`,
		viewport,
		expected: g.expected,
		actual: g.actual,
		hint: HINTS.fonts,
	}));
}

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
		failures.push({
			route,
			dimension: 'css',
			check: `computed style of ${describe(expected)}`,
			viewport,
			expected: props.map((p) => `${p}: ${expected.style[p]}`).join('; '),
			actual: props.map((p) => `${p}: ${actual.style[p] ?? '(unset)'}`).join('; '),
			hint: HINTS.css,
		});
	}
	if (extra) failures.push({ route, dimension: 'css', check: 'computed styles', viewport, expected: '', actual: `${extra} more elements differ`, hint: HINTS.css });
	return failures;
}

export function compareRoute(route: string, olds: readonly RouteCapture[], next: RouteCapture, probes: ReadonlyMap<string, Probe>): RouteResult {
	const oldA = olds[0]!;
	const others = olds.length > 1 ? olds.slice(1) : [oldA];
	const failures: Failure[] = [];
	const visualDiffs: { viewport: string; png: Buffer }[] = [];
	const shots: Shot[] = [];

	const chain = (c: RouteCapture) => Object.fromEntries(c.http.chain.map((hop, i) => [`hop ${i + 1}`, `${hop.status} ${hop.url}`]));
	for (const d of diffFields(fieldTemplates(chain(oldA), ...others.map(chain)), chain(next))) {
		const last = d.key === `hop ${oldA.http.chain.length}` && oldA.http.chain.length === next.http.chain.length;
		failures.push({ route, dimension: 'http', check: last ? 'status' : `redirect chain ${d.key}`, expected: d.expected ?? '(absent)', actual: d.actual ?? '(absent)', hint: last ? HINTS.status : HINTS.redirects });
	}
	if (others.every((o) => o.http.contentType === oldA.http.contentType) && oldA.http.contentType !== next.http.contentType) {
		failures.push({ route, dimension: 'http', check: 'content-type', expected: oldA.http.contentType, actual: next.http.contentType, hint: HINTS.contentType });
	}

	for (const [viewport, a] of Object.entries(oldA.pages)) {
		const bs = others.map((o) => o.pages[viewport]!);
		const n = next.pages[viewport];
		if (!n) continue;
		failures.push(...lineFailures(route, 'rendered', 'accessibility tree', viewport, diffLines(lineTemplates(a.aria, ...bs.map((b) => b.aria)), n.aria), HINTS.aria).slice(0, LIMIT));
		failures.push(...lineFailures(route, 'rendered', 'visible text', viewport, diffLines(lineTemplates(a.text, ...bs.map((b) => b.text)), n.text), HINTS.text).slice(0, LIMIT));

		const noise = visualNoise(a.screenshot, bs.map((b) => b.screenshot), noisyTextBoxes(a.elements, bs.map((b) => b.elements)));
		const diff = compareScreenshots(a.screenshot, n.screenshot, noise);
		shots.push({ label: viewport, viewport, old: a.screenshot, new: n.screenshot, diff: diff.png, regions: visuallyDifferent(diff) ? diff.regions : [], ok: !visuallyDifferent(diff) });
		if (visuallyDifferent(diff)) {
			const r = diff.region;
			const band = r && { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 24) };
			const near = band ? n.elements.filter((el) => overlaps(el.box, band)).sort((x, y) => x.box.width * x.box.height - y.box.width * y.box.height).slice(0, 2).map(describe) : [];
			const where = r ? `${diff.differing} pixels (${((diff.differing / diff.area) * 100).toFixed(2)}%) differ in x=${r.x}..${r.x + r.width}, y=${r.y}..${r.y + r.height}, first near ${near.join(', ') || 'no element'}` : 'no pixel differs in the shared area';
			if (diff.sizeMismatch) {
				failures.push({ route, dimension: 'visual', check: 'page size', viewport, expected: diff.sizeMismatch.expected, actual: `${diff.sizeMismatch.actual}; ${where}`, hint: HINTS.visualSize });
			} else {
				failures.push({ route, dimension: 'visual', check: 'screenshot', viewport, expected: 'same pixels outside the noise mask', actual: where, hint: HINTS.visual });
			}
			if (diff.png) visualDiffs.push({ viewport, png: diff.png });
		}

		failures.push(...cssFailures(route, viewport, a, bs, n));

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
	const seo = diffFields(fieldTemplates(oldA.pages[desktop]!.seo, ...others.map((o) => o.pages[desktop]!.seo)), next.pages[desktop]?.seo ?? {});
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
		} else if (found.contentType !== asset.contentType) {
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

	const failed = new Set(failures.map((f) => f.dimension));
	const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, failed.has(d) ? 'fail' : 'pass'])) as Record<Dimension, 'pass' | 'fail'>;
	return {
		route,
		ok: failures.length === 0,
		dimensions,
		failures,
		weight: { old: { downloaded: wa.downloaded, source: wa.source, executed: wa.executed }, new: { downloaded: wn.downloaded, source: wn.source, executed: wn.executed } },
		visualDiffs,
		shots,
	};
}
