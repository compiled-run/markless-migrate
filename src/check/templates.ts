import { tagHeaders, type SideEnv } from './browser.ts';
import { request } from './http.ts';
import { matchRoute, specificity } from '../source/pattern.ts';

/** Above this many pages, visual, responsiveness and motion run on one representative per template group. */
export const TEMPLATE_THRESHOLD = 20;

export interface TemplateGroup {
	readonly pattern: string;
	readonly representative: string;
	readonly members: readonly string[];
}

const ID = /^(\d+|[0-9a-f]{8,}|[0-9a-f-]{36}|\d{4}-\d\d(-\d\d)?)$/i;

/** The URL pattern a route belongs to: the most specific source pattern that serves it, else its parent path with the last segment open. */
export function urlPattern(route: string, patterns: readonly string[] = []): string {
	const path = route.split(/[?#]/)[0]!;
	const best = patterns.filter((p) => /[:*]/.test(p) && matchRoute(p, path)).sort((a, b) => specificity(b) - specificity(a))[0];
	if (best) return best;
	const trailing = path.length > 1 && path.endsWith('/');
	const segments = path.split('/').filter(Boolean);
	if (!segments.length) return '/';
	const open = segments.map((s, i) => (ID.test(s) ? ':id' : i === segments.length - 1 ? ':page' : s));
	return `/${open.join('/')}${trailing ? '/' : ''}`;
}

const LAYOUT = ['header', 'nav', 'main', 'aside', 'footer', 'article', 'form', 'table', 'iframe', 'video', 'canvas'];

/** The page's layout: which layout elements it has, in the order they open (repeats collapsed). */
export function domSignature(html: string): string {
	const body = html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
	const order: string[] = [];
	for (const m of body.matchAll(/<([a-z][a-z0-9-]*)\b/gi)) {
		const tag = m[1]!.toLowerCase();
		if (LAYOUT.includes(tag) && order.at(-1) !== tag) order.push(tag);
	}
	return order.join('>');
}

const WIDGET_ROLES = new Set(['button', 'tab', 'tablist', 'tabpanel', 'switch', 'checkbox', 'radio', 'radiogroup', 'slider', 'combobox', 'listbox', 'menu', 'menubar', 'menuitem', 'tooltip', 'dialog', 'alertdialog', 'tree', 'treeitem', 'region']);
const WIDGET_TAGS = new Set(['details', 'dialog', 'select']);

/**
 * The kinds of control the page renders, each by its role (or tag) and the component slot it carries: two pages of
 * one URL pattern that show different components (an accordion's page and a tooltip's) are not one template, since
 * what one's controls do and animate says nothing about the other's.
 */
export function widgetSignature(html: string): string {
	const body = html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
	const kinds = new Set<string>();
	for (const m of body.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
		const tag = m[1]!.toLowerCase();
		const attrs = m[2]!;
		const value = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)?.slice(1).find((v) => v !== undefined);
		const role = value('role');
		const slot = value('data-slot');
		const control = /\saria-(expanded|haspopup|controls)\b/i.test(attrs) || (role !== undefined && WIDGET_ROLES.has(role)) || WIDGET_TAGS.has(tag) || /-trigger$/.test(slot ?? '');
		if (!control) continue;
		kinds.add(`${role ?? tag}${slot ? `#${slot}` : ''}`);
	}
	return [...kinds].sort().join(' ');
}

/** Groups pages by URL pattern, the old page's layout and the kinds of control it renders; each group's representative is its first page in sorted order. */
export async function groupTemplates(env: SideEnv, pages: readonly string[], patterns: readonly string[] = []): Promise<TemplateGroup[]> {
	const signatures = new Map<string, string>();
	let next = 0;
	const list = [...pages];
	await Promise.all(Array.from({ length: Math.min(8, list.length) }, async () => {
		while (next < list.length) {
			const route = list[next++]!;
			const html = await request(new URL(route, env.origin), { headers: tagHeaders(env) }).then((r) => r.text()).catch(() => '');
			signatures.set(route, `${domSignature(html)}\u0000${widgetSignature(html)}`);
		}
	}));
	const groups = new Map<string, string[]>();
	for (const route of [...pages].sort()) {
		const key = `${urlPattern(route, patterns)}\u0000${signatures.get(route) ?? ''}`;
		groups.set(key, [...(groups.get(key) ?? []), route]);
	}
	return [...groups].map(([key, members]) => ({ pattern: key.split('\u0000')[0]!, representative: members[0]!, members }));
}
