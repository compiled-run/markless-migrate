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
];

export function frameworkRuntime(code: string): string | undefined {
	return RUNTIMES.find(([, all]) => all.every((re) => re.test(code)))?.[0];
}

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
