import { AUTOMATIC_RULES, type AutomaticRule } from '../overrides.ts';
import type { AssetRecord, Box, Failure, PageCapture } from './types.ts';

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
	// A lazy chunk of a webpack or Rspack build: the old bundler's module loader, whatever framework the build is for.
	['webpack', [/\b(?:self|globalThis|window)\.(?:webpack|rspack)Chunk[\w$]*/]],
];

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

/** Keys a framework's runtime writes for itself, never the app: htmx's history cache. */
const FRAMEWORK_KEYS: readonly { readonly framework: string; readonly key: RegExp }[] = [{ framework: 'htmx', key: /^(sessionStorage|localStorage) htmx-(history-cache|current-path-for-history)$/ }];

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
	const runtimes = (pages: readonly PageCapture[]) => new Set(pages.flatMap((p) => p.assets.flatMap((a) => (a.runtime ? [a.runtime] : []))));
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
