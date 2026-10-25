import { AUTOMATIC_RULES, type AutomaticRule } from '../overrides.ts';
import type { AssetRecord, Box, Failure, ImageRecord, PageCapture } from './types.ts';

export { AUTOMATIC_RULES, type AutomaticRule };

/** Code only a UI framework's runtime carries; a bundle with one of these is the old framework's own code. */
const RUNTIMES: readonly [string, readonly RegExp[]][] = [
	['Next.js', [/__NEXT_DATA__|self\.__next_f\b|__next_set_public_path__/]],
	['React', [/__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED|__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE|Symbol\.for\(\s*["']react\.(transitional\.)?element["']\)/]],
	['Vue', [/__VUE_OPTIONS_API__|__VUE_PROD_DEVTOOLS__|__vue_app__/]],
	['Svelte', [/\b__svelte\b|svelte\/internal/]],
	['Angular', [/ɵɵdefineComponent|ɵcmp\b/]],
	['Solid', [/\$DX_DELEGATE|\b_\$HY\b/]],
	['Preact', [/__PREACT_DEVTOOLS__/]],
	['htmx', [/htmx:configRequest/, /htmx:afterSwap/]],
	['Alpine.js', [/\bAlpine\b/, /x-data/, /x-init/]],
];

/** Libraries that keep storage of their own, found in a bundle whatever UI framework it also carries. */
const LIBRARIES: readonly [string, readonly RegExp[]][] = [['Firebase', [/previous_websocket_failure/, /firebaseio\.com/]]];

export function scriptLibraries(code: string): string[] {
	return LIBRARIES.filter(([, all]) => all.every((re) => re.test(code))).map(([name]) => name);
}

export function frameworkRuntime(code: string): string | undefined {
	return RUNTIMES.find(([, all]) => all.every((re) => re.test(code)))?.[0];
}

/** The elements a framework adds to every page for itself (route announcers), as one selector. */
export const FRAMEWORK_MARKUP_SELECTOR = 'next-route-announcer, #gatsby-announcer, #svelte-announcer, .nuxt-route-announcer';

/** Markup a framework adds to every page for itself. Run in the page, so it carries its own list. */
export function frameworkMarkup(): { framework: string; what: string; selector: string; roles: string[]; text: string }[] {
	const known = [
		{ framework: 'Next.js', what: 'route announcer', selector: 'next-route-announcer' },
		{ framework: 'Gatsby', what: 'route announcer', selector: '#gatsby-announcer' },
		{ framework: 'SvelteKit', what: 'route announcer', selector: '#svelte-announcer' },
		{ framework: 'Nuxt', what: 'route announcer', selector: '.nuxt-route-announcer' },
	];
	const out: { framework: string; what: string; selector: string; roles: string[]; text: string }[] = [];
	for (const k of known) {
		const host = document.querySelector(k.selector);
		if (!host) continue;
		const inside = [host, ...host.querySelectorAll('[role]'), ...(host.shadowRoot ? host.shadowRoot.querySelectorAll('[role]') : [])];
		const text = [host.textContent ?? '', host.shadowRoot?.textContent ?? ''].join(' ').replace(/\s+/g, ' ').trim();
		out.push({ ...k, roles: [...new Set(inside.map((el) => el.getAttribute('role') ?? '').filter(Boolean))], text });
	}
	return out;
}

/** Iframes and images served from another origin, with their boxes in page coordinates (as a full-page screenshot has them). */
export function thirdPartyEmbeds(): { tag: 'iframe' | 'img'; src: string; box: { x: number; y: number; width: number; height: number } }[] {
	const out: { tag: 'iframe' | 'img'; src: string; box: { x: number; y: number; width: number; height: number } }[] = [];
	for (const el of document.querySelectorAll('iframe[src], img')) {
		const raw = el instanceof HTMLImageElement ? el.currentSrc || el.src : (el as HTMLIFrameElement).src;
		if (!raw) continue;
		let url: URL;
		try {
			url = new URL(raw, location.href);
		} catch {
			continue;
		}
		if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		out.push({ tag: el.tagName === 'IFRAME' ? 'iframe' : 'img', src: url.href, box: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) } });
	}
	return out;
}

const candidate = (rule: AutomaticRule, reason: string): NonNullable<Failure['automatic']> => ({ rule, reason });

/** An old page's script the new page does not request, whose code is the old framework's runtime. */
export function runtimeCandidate(asset: AssetRecord, requestedByNew: boolean): Failure['automatic'] {
	if (asset.type !== 'script' || !asset.runtime || requestedByNew) return undefined;
	return candidate('old-framework-runtime', `${asset.url} carries ${asset.runtime}'s runtime and the new page does not request it; what that code did on the page is compared by the other checks`);
}

const markupLine = (line: string, role: string, text: string) => line.trim() === (text ? `- ${role}: ${text}` : `- ${role}`);

/** An accessibility tree line the old page has only because its framework added markup for itself, which the new page does not have. */
export function markupCandidate(line: string, actual: string, old: PageCapture, next: PageCapture): Failure['automatic'] {
	if (actual !== '(absent)') return undefined;
	const gone = (old.internals ?? []).filter((m) => !(next.internals ?? []).some((n) => n.selector === m.selector));
	const hit = gone.find((m) => m.roles.some((role) => markupLine(line, role, m.text)));
	return hit && candidate('framework-markup', `${hit.framework}'s ${hit.what} (${hit.selector}), which ${hit.framework} adds to every page for itself; the Markless page has no such markup`);
}

const PAD = 8;
const inside = (r: Box, b: Box) => r.x >= b.x - PAD && r.y >= b.y - PAD && r.x + r.width <= b.x + b.width + PAD && r.y + r.height <= b.y + b.height + PAD;
const sameEmbed = (a: string, b: string) => {
	const strip = (s: string) => s.split('#')[0]!;
	return strip(a) === strip(b);
};

/** Pixels that differ only inside a third-party embed both pages load from the same address: the embed's live content moved, not the page. */
export function embedCandidate(regions: readonly Box[], old: PageCapture, next: PageCapture): Failure['automatic'] {
	if (!regions.length) return undefined;
	const shared = (old.embeds ?? []).filter((e) => (next.embeds ?? []).some((n) => n.tag === e.tag && sameEmbed(n.src, e.src) && Math.abs(n.box.y - e.box.y) <= PAD && Math.abs(n.box.x - e.box.x) <= PAD));
	if (!regions.every((r) => shared.some((e) => inside(r, e.box)))) return undefined;
	const hosts = [...new Set(shared.filter((e) => regions.some((r) => inside(r, e.box))).map((e) => new URL(e.src).host))];
	return candidate('live-embed', `every differing pixel is inside ${hosts.length === 1 ? 'an embed' : 'embeds'} from ${hosts.join(', ')} that both pages load from the same address`);
}

// An image optimizer's address names its source image in a query; a file's name, less its content hash and a width
// suffix, names the image its renditions were made from (photo.Bx7c9Kq2.jpg, photo-640w.webp).
const OPTIMIZERS = new Set(['/_next/image', '/_vercel/image']);
const HASH = /[.-]([A-Za-z0-9_-]{8}|[a-f0-9]{16,})$/;
const hashy = (token: string) => /\d/.test(token) || (/[a-z]/.test(token) && /[A-Z]/.test(token));
export function imageIdentity(src: string): string {
	const url = URL.parse(src, 'http://x');
	if (!url) return src;
	if (OPTIMIZERS.has(url.pathname) && url.searchParams.get('url')) return `${url.pathname}?url=${url.searchParams.get('url')}`;
	let name = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)).replace(/\.[a-z0-9]+$/i, '');
	for (let i = 0; i < 2; i++) {
		const hash = HASH.exec(name);
		if (hash && hashy(hash[1]!)) name = name.slice(0, hash.index);
		name = name.replace(/[-_@]\d{2,4}w$/, '');
	}
	return `${url.origin}/${name}`;
}

/** The new page draws the old page's image from another rendition of it (a srcset width), as sharp as its box needs at the screenshot's scale. */
export function responsiveImageCandidate(old: ImageRecord, next: ImageRecord | undefined): Failure['automatic'] {
	if (!next || old.broken || next.broken || old.src === next.src || imageIdentity(old.src) !== imageIdentity(next.src)) return undefined;
	if (!old.naturalHeight || !next.naturalHeight || Math.abs(old.naturalWidth / old.naturalHeight - next.naturalWidth / next.naturalHeight) > 0.01 * (old.naturalWidth / old.naturalHeight)) return undefined;
	if (!next.box || next.naturalWidth < next.box.width) return undefined;
	return candidate('responsive-image', `${next.src} is ${old.src} at ${next.naturalWidth}x${next.naturalHeight}, which the srcset gives a ${next.box.width} px wide box; the old page drew a ${old.naturalWidth} px file there`);
}

/** Decoded screenshots of both pages, and where the shot starts on the page (a shot clipped around a state's target). */
export interface Shots {
	readonly old: { readonly width: number; readonly height: number; readonly data: Uint8Array };
	readonly new: { readonly width: number; readonly height: number; readonly data: Uint8Array };
	readonly x?: number;
	readonly y?: number;
}

const BLOCK = 8;

/**
 * The same picture at another resolution: its 8 px blocks average to nearly the same colour on both shots. Resampling
 * moves single pixels (most of them, in a grainy photo) but not the blocks; another picture moves the blocks.
 */
export function samePicture(shots: Shots, box: Box): boolean {
	const x0 = Math.max(0, box.x - (shots.x ?? 0));
	const y0 = Math.max(0, box.y - (shots.y ?? 0));
	const x1 = Math.min(shots.old.width, shots.new.width, x0 + box.width);
	const y1 = Math.min(shots.old.height, shots.new.height, y0 + box.height);
	const diffs: number[] = [];
	for (let by = y0; by + BLOCK <= y1; by += BLOCK)
		for (let bx = x0; bx + BLOCK <= x1; bx += BLOCK) {
			let d = 0;
			for (let c = 0; c < 3; c++) {
				let a = 0;
				let b = 0;
				for (let y = by; y < by + BLOCK; y++)
					for (let x = bx; x < bx + BLOCK; x++) {
						a += shots.old.data[(y * shots.old.width + x) * 4 + c]!;
						b += shots.new.data[(y * shots.new.width + x) * 4 + c]!;
					}
				d = Math.max(d, Math.abs(a - b) / (BLOCK * BLOCK));
			}
			diffs.push(d);
		}
	if (!diffs.length) return false;
	diffs.sort((p, q) => p - q);
	return diffs.reduce((s, d) => s + d, 0) / diffs.length <= 6 && diffs[Math.floor(diffs.length * 0.98)]! <= 24;
}

/** Pixels that differ only inside images the new page draws from a smaller rendition of the old page's file: the resampling, not the page. */
export function responsiveRegionsCandidate(regions: readonly Box[], old: PageCapture, next: PageCapture, differing?: number, shots?: Shots): Failure['automatic'] {
	if (!regions.length) return undefined;
	// Paired by the picture and where it is drawn, not by position in the list: a page may add or drop an image elsewhere.
	const renditions = next.images.flatMap((n) => {
		const o = n.box && old.images.find((img) => img.box && imageIdentity(img.src) === imageIdentity(n.src) && Math.abs(img.box.x - n.box!.x) <= PAD && Math.abs(img.box.y - n.box!.y) <= PAD);
		const auto = o && responsiveImageCandidate(o, n);
		return auto ? [{ box: n.box!, auto }] : [];
	});
	// Diff regions are whole 16 px cells, so one may reach a cell past the image's edge.
	const within = (r: Box, b: Box) => inside(r, { x: b.x - 16, y: b.y - 16, width: b.width + 32, height: b.height + 32 });
	if (!renditions.length || !regions.every((r) => renditions.some((x) => within(r, x.box)))) return undefined;
	const used = renditions.filter((x) => regions.some((r) => within(r, x.box)));
	if (shots) {
		if (!used.every((x) => samePicture(shots, x.box))) return undefined;
	} else if (differing !== undefined && differing > 0.1 * used.reduce((s, x) => s + x.box.width * x.box.height, 0)) return undefined;
	return candidate('responsive-image', `every differing pixel is inside ${used.length === 1 ? 'an image' : `${used.length} images`} drawn from another width of the same file: ${used.map((x) => x.auto!.reason).join('; ')}`);
}

/** An image no viewport draws, which the old page fetched anyway and the new page leaves to load when it is drawn. */
export function unshownLazyCandidate(old: ImageRecord, next: ImageRecord | undefined): Failure['automatic'] {
	if (!next || old.box || next.box || next.loading !== 'lazy' || next.naturalWidth || imageIdentity(old.src) !== imageIdentity(next.src)) return undefined;
	return candidate('unshown-lazy-image', `the page does not draw ${next.src} here, and the new page marks it loading="lazy", so it loads when it is drawn; the old page fetched it anyway`);
}

/** A third-party image both pages load from the same address that came back different: its content is live. */
export function embedImageCandidate(src: string, old: PageCapture, next: PageCapture): Failure['automatic'] {
	const has = (p: PageCapture) => (p.embeds ?? []).some((e) => e.tag === 'img' && sameEmbed(e.src, src));
	return has(old) && has(next) ? candidate('live-embed', `${new URL(src).host} served a different image at the same address to each page, so its content is live`) : undefined;
}

/**
 * An element the old page would not let a visitor use, which the new page refuses for the same reason (covered, hidden, outside the page).
 * One check could not drive on the old page (not found again, or never settled) is never accepted: what it does was compared nowhere.
 */
export function unreachableCandidate(kind: string, oldReason: string, onNew: { readonly failed?: string; readonly unreachable?: string } | undefined): Failure['automatic'] {
	const old = oldReason.replace(/^it could not be used on the old page: /, '');
	if (kind === 'missing' || kind === 'timeout') return undefined;
	if (!onNew?.unreachable || onNew.unreachable !== kind) return undefined;
	return candidate('unreachable-on-both', `neither page lets a visitor use it, for the same reason (${kind}): old ${old}; new ${onNew.failed ?? kind}`);
}

/** Keys a framework's runtime writes for itself, never the app: htmx's history cache, and the entry state of history 2 and 3, React Router's, and the Firebase SDK's connection flag. */
const FRAMEWORK_KEYS: readonly { readonly framework: string; readonly key: RegExp }[] = [
	{ framework: 'htmx', key: /^(sessionStorage|localStorage) htmx-(history-cache|current-path-for-history)$/ },
	{ framework: 'React', key: /^sessionStorage @@History\/./ },
	{ framework: 'Firebase', key: /^localStorage firebase:previous_websocket_failure$/ },
];

/** The server framework whose own sealed format a cookie value is in: Laravel encrypts every cookie it sets as base64 JSON with iv, value and mac. */
export function sealedBy(value: string): string | undefined {
	try {
		const json = JSON.parse(Buffer.from(decodeURIComponent(value), 'base64').toString('utf8')) as Record<string, unknown>;
		return typeof json.iv === 'string' && typeof json.value === 'string' && typeof json.mac === 'string' ? 'Laravel' : undefined;
	} catch {
		return undefined;
	}
}

/** Which framework a storage line (`sessionStorage htmx-history-cache`, `+ cookie x_session HttpOnly ...`) belongs to: one whose runtime or sealed cookies the old page carries and the new page does not. */
export type StorageOwner = (line: string) => string | undefined;

export function storageOwner(olds: readonly PageCapture[], next: readonly PageCapture[]): StorageOwner {
	const runtimes = (pages: readonly PageCapture[]) => new Set(pages.flatMap((p) => p.assets.flatMap((a) => [...(a.runtime ? [a.runtime] : []), ...(a.libraries ?? [])])));
	const sealed = (pages: readonly PageCapture[]) => new Map(pages.flatMap((p) => Object.entries(p.sealed ?? {})));
	const [oldRuntimes, newRuntimes, oldSealed, newSealed] = [runtimes(olds), runtimes(next), sealed(olds), sealed(next)];
	return (line) => {
		const [kind = '', key = ''] = line.replace(/^[+-] /, '').split(' ');
		if (kind === 'cookie') {
			const framework = oldSealed.get(key);
			return framework && !newSealed.has(key) && ![...newSealed.values()].includes(framework) ? framework : undefined;
		}
		return FRAMEWORK_KEYS.find((k) => k.key.test(`${kind} ${key}`) && oldRuntimes.has(k.framework) && !newRuntimes.has(k.framework))?.framework;
	};
}

/** Storage differences that are all keys only the old framework's own code wrote, none of them kept by the new page. */
export function storageCandidate(missing: readonly string[], extra: readonly string[], owner: StorageOwner | undefined): Failure['automatic'] {
	if (!owner || !missing.length || extra.length) return undefined;
	const owners = missing.map(owner);
	if (owners.some((o) => !o)) return undefined;
	return candidate('framework-storage', `${missing.map((m, i) => `${m.replace(/^[+-] /, '').split(' ').slice(0, 2).join(' ')} (${owners[i]})`).join(', ')}: written only by the old framework's own code, which the new page does not run`);
}


const announces = (f: Failure) => /\bannounced:/.test(f.expected) || /\bannounced:/.test(f.actual);

/**
 * Marks the candidates whose rule holds as accepted automatically. Framework markup holds only when nothing else in the
 * route's accessibility tree, and none of its announcements, differ.
 */
export function grantAutomatic(failures: readonly Failure[], off: readonly AutomaticRule[], date: string): Failure[] {
	const open = failures.filter((f) => !f.accepted);
	const otherTree = (f: Failure) => open.some((o) => o !== f && o.dimension === 'rendered' && o.check === 'accessibility tree' && o.automatic?.rule !== 'framework-markup');
	const otherAnnouncements = open.some(announces);
	return failures.map((f) => {
		const auto = f.automatic;
		if (f.accepted || !auto || off.includes(auto.rule)) return f;
		if (auto.rule === 'framework-markup' && (otherTree(f) || otherAnnouncements)) return f;
		return { ...f, accepted: { reason: auto.reason, by: 'markless-migrate', date, automatic: auto.rule } };
	});
}

export function acceptedLabel(accepted: NonNullable<Failure['accepted']>): string {
	return accepted.automatic ? `accepted automatically: ${AUTOMATIC_RULES[accepted.automatic]}` : `accepted by ${accepted.by}`;
}
