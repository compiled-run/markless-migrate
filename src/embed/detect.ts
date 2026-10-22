import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, within, type HtmlElement } from '../usage/html.ts';
import type { UseSite } from '../usage/types.ts';
import { frameProvider, hostProvider, loaderProvider, PROVIDERS } from './providers.ts';
import type { EmbedForm, EmbedUse, KeepReason, Provider } from './types.ts';

const FRAME_ATTRIBUTES = ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'frameborder', 'sandbox', 'class', 'style', 'autoplay', 'muted', 'controls', 'poster'];

const slug = (key: string) => key.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

/** The repository and kind of a GitHub button, from its link and data attributes or from the frame's parameters. */
function githubButton(href: string, attrs: ReadonlyMap<string, string>): { key: string; url: string } {
	const path = URL.parse(href, 'https://github.com')?.pathname.replace(/^\/|\/$/g, '') ?? href;
	const icon = attrs.get('data-icon') ?? '';
	const type = /fork/.test(icon) || /\/fork$/.test(path) ? 'fork' : /eye|watch/.test(icon) || /\/subscription$/.test(path) ? 'watch' : /sponsor|heart/.test(icon) || path.startsWith('sponsors/') ? 'sponsor' : path.split('/').length === 1 ? 'follow' : 'star';
	const repo = path.split('/').slice(0, type === 'follow' ? 1 : 2).join('/');
	return { key: `${repo}-${type}`, url: `https://github.com/${repo}` };
}

function frameParams(src: string): Map<string, string> {
	const url = URL.parse(src);
	const params = new Map<string, string>();
	for (const part of [url?.search.slice(1) ?? '', url?.hash.slice(1) ?? '']) for (const [k, v] of new URLSearchParams(part)) params.set(k, v);
	return params;
}

/** Why a use must stay as it is, beyond its provider's own reason: it plays at load, or the page's code drives it. */
function keepFor(provider: Provider, form: EmbedForm, el: HtmlElement, src: string | undefined): { reason: KeepReason; why: string } | undefined {
	if (provider.keep) return provider.keep;
	if (form === 'api') return { reason: 'driven-by-page', why: `the page creates and drives the ${provider.name} player through its JavaScript API before any click` };
	const params = src ? frameParams(src) : new Map<string, string>();
	if (el.attrs.has('autoplay') || /^(1|true)$/.test(params.get('autoplay') ?? '')) return { reason: 'autoplay', why: `it is set to play at load (${el.attrs.has('autoplay') ? 'the autoplay attribute' : 'autoplay=1'})${params.get('mute') === '1' || params.get('muted') === '1' || el.attrs.has('muted') ? ', muted' : ''}` };
	if (/^(1|true)$/.test(params.get('enablejsapi') ?? params.get('api') ?? '')) return { reason: 'driven-by-page', why: `it asks for the ${provider.name} player's JavaScript API (${params.has('enablejsapi') ? 'enablejsapi' : 'api'}=1), so the page's own code may drive it` };
	return undefined;
}

function attributesOf(el: HtmlElement): Record<string, string> {
	const attrs = Object.fromEntries([...el.attrs].filter(([k]) => FRAME_ATTRIBUTES.includes(k) || k.startsWith('data-') || k === 'href' || k.startsWith('aria-')));
	return el.label && el.tag !== 'iframe' ? { ...attrs, '#text': el.label } : attrs;
}

export interface PageEmbed extends Omit<EmbedUse, 'routes' | 'sites'> {
	readonly site: UseSite;
}

function use(provider: Provider, form: EmbedForm, key: string, el: HtmlElement, route: string, url: string | undefined, loaders: string[]): PageEmbed {
	const keep = keepFor(provider, form, el, el.attrs.get('src'));
	return {
		id: [provider.id.replace(/[:.]/g, '-'), slug(key)].filter(Boolean).join('-'),
		provider: provider.id,
		providerName: provider.name,
		kind: provider.kind,
		form,
		key,
		...(url ? { url } : {}),
		loaders,
		element: describe(el),
		attributes: attributesOf(el),
		...(provider.adapter && !keep && form !== 'facade' ? { adapter: provider.adapter } : {}),
		...(keep ? { keep } : {}),
		terms: provider.terms,
		site: { route, element: describe(el), line: el.line },
	};
}

/** The post a placeholder blockquote links to (an X post's status link, the last one in the quote). */
function linkedPost(el: HtmlElement, elements: readonly HtmlElement[], pattern: RegExp): string | undefined {
	const links = elements.filter((e) => e.tag === 'a' && e.index > el.index && within(e, (p) => p === el)).map((e) => e.attrs.get('href') ?? '');
	return links.reverse().find((href) => pattern.test(href));
}

/**
 * Every third-party embed one page's markup carries: frames by their provider's address, placeholder and facade
 * markup by its provider, and loader scripts (a loader with no placeholder on the page is an embed the page's own
 * code creates). A frame no provider is known for is an embed of its host.
 */
export function detectEmbeds(elements: readonly HtmlElement[], route: string, origin?: string): PageEmbed[] {
	const out: PageEmbed[] = [];
	const local = (src: string) => {
		const url = URL.parse(src, origin ?? 'http://local.invalid');
		return !url || !/^https?:$/.test(url.protocol) || (origin ? url.origin === new URL(origin).origin : !/^https?:\/\//.test(src));
	};
	const loaders = new Map<string, { provider: Provider; key: string; src: string; el: HtmlElement }[]>();
	for (const el of elements) {
		if (el.tag !== 'script' || !el.attrs.get('src')) continue;
		const src = el.attrs.get('src')!;
		const found = local(src) ? undefined : loaderProvider(new URL(src, origin ?? 'http://local.invalid').href);
		if (found) loaders.set(found.provider.id, [...(loaders.get(found.provider.id) ?? []), { ...found, src, el }]);
	}
	const placed = new Set<string>();
	const loaderSrcs = (provider: Provider) => (loaders.get(provider.id) ?? []).map((l) => l.src);
	for (const el of elements) {
		const src = el.tag === 'iframe' || el.tag === 'embed' ? el.attrs.get('src') : el.tag === 'object' ? el.attrs.get('data') : el.tag === 'video' ? (el.attrs.get('src') ?? elements.find((s) => s.tag === 'source' && s.parent === el)?.attrs.get('src')) : undefined;
		if (src && !local(src)) {
			const absolute = new URL(src, origin ?? 'http://local.invalid').href;
			const found = frameProvider(absolute);
			const provider = found?.provider ?? hostProvider(new URL(absolute));
			let key = found?.key ?? new URL(absolute).pathname;
			let url = absolute;
			if (provider.id === 'github-button' || provider.id === 'ghbtns') {
				const params = frameParams(absolute);
				const button = githubButton(params.get('href') ?? `${params.get('user') ?? ''}/${params.get('repo') ?? ''}`, new Map([['data-icon', params.get('data-icon') ?? params.get('type') ?? '']]));
				key = button.key;
				url = button.url;
			}
			out.push(use(provider, 'iframe', key, el, route, url, loaderSrcs(provider)));
			placed.add(provider.id);
			continue;
		}
		for (const provider of PROVIDERS) {
			const m = provider.markup?.(el.tag, el.attrs);
			if (!m) continue;
			let key = m.key;
			let url: string | undefined;
			if (provider.id === 'github-button') ({ key, url } = githubButton(el.attrs.get('href') ?? '', el.attrs));
			else if (provider.id === 'twitter') {
				url = linkedPost(el, elements, /(?:twitter|x)\.com\/\w+\/status\/\d+/);
				key = /\/status\/(\d+)/.exec(url ?? '')?.[1] ?? '';
			} else if (provider.id === 'youtube') url = `https://www.youtube.com/watch?v=${key}`;
			else if (provider.id === 'vimeo') url = `https://vimeo.com/${key}`;
			else if (/^https?:\/\//.test(key)) url = key;
			const hasLoader = loaders.has(provider.id);
			const form: EmbedForm = m.form === 'facade' ? 'facade' : hasLoader || provider.keep ? 'script' : 'markup';
			out.push(use(provider, form, key, el, route, url, loaderSrcs(provider)));
			placed.add(provider.id);
			break;
		}
	}
	for (const [id, list] of loaders) {
		if (placed.has(id)) continue;
		for (const { provider, key, src, el } of list) {
			// A gist's script is the embed: it writes the gist where it stands.
			const form: EmbedForm = provider.id === 'gist' || provider.keep ? 'script' : 'api';
			out.push(use(provider, form, provider.keep ? '' : key || new URL(src, origin ?? 'http://local.invalid').hostname, el, route, provider.id === 'gist' ? new URL(src).href.replace(/\.js(\?.*)?$/, '') : undefined, [src]));
		}
	}
	return out;
}

/** Collects one page's embeds across pages: the same embed on many pages (a header's GitHub button) is one use with every route. */
export class EmbedUses {
	private readonly byId = new Map<string, { use: Omit<EmbedUse, 'routes' | 'sites'>; routes: Set<string>; sites: UseSite[] }>();

	add(found: readonly PageEmbed[], route: string): void {
		for (const { site, ...use } of found) {
			let entry = this.byId.get(use.id);
			if (!entry) {
				entry = { use, routes: new Set(), sites: [] };
				this.byId.set(use.id, entry);
			}
			entry.routes.add(route);
			if (entry.sites.length < 12 && !entry.sites.some((s) => JSON.stringify(s) === JSON.stringify(site))) entry.sites.push(site);
		}
	}

	list(): EmbedUse[] {
		return [...this.byId.values()].map(({ use, routes, sites }) => ({ ...use, routes: [...routes].sort(), sites })).sort((a, b) => a.id.localeCompare(b.id));
	}
}

/** What the migration does with an embed, in a few words. */
export function embedPlan(use: Pick<EmbedUse, 'form' | 'adapter' | 'keep' | 'providerName'>): string {
	if (use.keep) return `keep as it is: ${use.keep.why}; upgrade measures what it costs`;
	if (use.form === 'markup') return 'already static markup: port it as page markup';
	if (use.form === 'facade') return `the old site already draws a click-to-load ${use.providerName} facade: port its markup as it is and make activating it do what it does (load the player in its place, playing)`;
	if (use.adapter) return `use the pre-built ${use.adapter} component (markless-migrate embeds install ${use.adapter}), then check it against the old embed`;
	return `write a Markless component for this ${use.providerName} embed from its study (markless-migrate embeds), then check it against the old embed`;
}

/** Each route and the embeds on it, with their provider and plan: what `markless-migrate embeds` prints. */
export function embedsByRoute(uses: readonly EmbedUse[]): string {
	const byRoute = new Map<string, EmbedUse[]>();
	for (const use of uses) for (const route of use.routes) byRoute.set(route, [...(byRoute.get(route) ?? []), use]);
	const lines = [`${uses.length} embed(s) on ${byRoute.size} route(s).`];
	for (const [route, list] of [...byRoute].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(route);
		for (const u of list) lines.push(`  ${u.id}  ${u.providerName}, ${u.form}${u.adapter ? `, adapter ${u.adapter}` : ''}: ${embedPlan(u)}`);
	}
	return `${lines.join('\n')}\n`;
}

/**
 * What the run's prompt tells the agent about one route's embeds: each one's plan, its study (pictures, markup, data),
 * the pre-built adapter when there is one, and where the check writes its old, new and diff images.
 */
export function embedBrief(uses: readonly EmbedUse[], route: string, dir: string, cli: string, stale: ReadonlySet<string> = new Set()): string | undefined {
	const here = uses.filter((u) => u.routes.includes(route) && u.form !== 'markup');
	if (!here.length) return undefined;
	const lines = [`Embeds on ${route} (from .migrate/embeds.json). Each gets its own Markless component in real markup (real text, images and CSS fed by its real data, never a screenshot), whose root carries data-markless-embed="<id>", unless it is kept. Its images load from the provider's own addresses (never copy a provider's images or media into the app); a value the provider keeps changing (a count) goes on an element marked data-markless-embed-live:`];
	for (const u of here) {
		const study = join(dir, u.id, 'study.md');
		lines.push(`- ${u.id}: ${u.providerName} (${u.form}) ${u.element}. ${embedPlan(u)}.`);
		if (u.keep) {
			lines.push(`    Keep it exactly as the old page has it (same element, address and attributes); the check compares it live.`);
			continue;
		}
		lines.push(existsSync(study) ? `    Study: ${study} (reference pictures at rest, hovered and focused for desktop and mobile, light and dark; markup; data; what a click does).` : `    Study it first: ${cli} embeds study --embed ${u.id} (writes ${study}).`);
		if (u.adapter) lines.push(`    Pre-built: ${cli} embeds install ${u.adapter} copies the component and writes its data; render it with the props it prints.${stale.has(u.adapter) ? ' The copy in lib/embeds/ is older than the adapter this markless-migrate ships: run that install again first.' : ''}`);
		lines.push(`    The check compares it with the old embed pixel for pixel in every state and viewport, then activates both by click and by keyboard; its old, new and diff images go to ${join(dir, u.id, 'check')}/. Iterate until green. If it cannot match (the embed must be live at load, depends on a signed-in visitor, or the provider's terms forbid recreating it), keep the original and say why.`);
	}
	return lines.join('\n');
}
