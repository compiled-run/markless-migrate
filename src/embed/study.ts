import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Frame } from 'playwright';
import type { SideEnv } from '../check/browser.ts';
import type { LiveEmbed } from '../check/embeds.ts';
import type { Viewport } from '../check/types.ts';
import { activate, describeActivation, openSide, stateShot, target, type Activation, type EmbedState } from './check.ts';
import { embedData, type EmbedData } from './data.ts';
import { embedPlan } from './detect.ts';
import { frameProvider } from './providers.ts';
import type { EmbedUse } from './types.ts';

export interface VisibleElement {
	readonly tag: string;
	readonly classes: string;
	readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	readonly text?: string;
	readonly style: Readonly<Record<string, string>>;
	readonly src?: string;
	readonly svg?: string;
}

export interface EmbedStudy {
	readonly id: string;
	readonly route: string;
	readonly found: boolean;
	readonly boxes: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
	readonly shots: readonly string[];
	readonly markup?: string;
	readonly elements?: readonly VisibleElement[];
	readonly activation?: Activation;
	readonly data: EmbedData;
	readonly notes: readonly string[];
}

/** Runs in a frame's document or around one element: every visible element, its box relative to the root, its own text and the styles that draw it. Must stay self-contained. */
function visibleElements(selector: string | null): VisibleElement[] {
	const root = selector ? document.querySelector(selector) : document.body;
	if (!root) return [];
	const origin = root.getBoundingClientRect();
	const keys = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'background-size', 'background-position', 'border', 'border-radius', 'box-shadow', 'opacity', 'padding', 'display', 'position', 'white-space', 'text-overflow', 'fill'];
	const out: VisibleElement[] = [];
	const walk = (el: Element) => {
		if (out.length >= 300) return;
		const r = el.getBoundingClientRect();
		const s = getComputedStyle(el);
		if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0) {
			const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
			const style = Object.fromEntries(keys.map((k) => [k, s.getPropertyValue(k)]).filter(([k, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto' && !(k === 'background-color' && v === 'rgba(0, 0, 0, 0)') && v !== '0px'));
			const src = (el as HTMLImageElement).currentSrc || el.getAttribute('src') || undefined;
			out.push({ tag: el.localName, classes: el.getAttribute('class') ?? '', box: { x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y), width: Math.round(r.width), height: Math.round(r.height) }, ...(text ? { text: text.slice(0, 200) } : {}), style, ...(src ? { src } : {}), ...(el.localName === 'svg' ? { svg: el.outerHTML.slice(0, 3000) } : {}) });
		}
		if (el.localName === 'svg') return;
		for (const child of el.children) walk(child);
		if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child);
	};
	walk(root);
	return out;
}

/** Runs in the page: the element's markup with its shadow roots written out as declarative ones. Must stay self-contained. */
function markupWithShadow(selector: string): string {
	const el = document.querySelector(selector);
	if (!el) return '';
	const roots: ShadowRoot[] = [];
	const collect = (e: Element) => {
		if (e.shadowRoot) roots.push(e.shadowRoot);
		for (const c of e.children) collect(c);
		if (e.shadowRoot) for (const c of e.shadowRoot.children) collect(c);
	};
	collect(el);
	const start = el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1);
	const inner = (el as Element & { getHTML?: (o: unknown) => string }).getHTML?.({ serializableShadowRoots: true, shadowRoots: roots }) ?? el.innerHTML;
	return `${start}${inner}</${el.localName}>`;
}

/** Which live embed of the old page this use is: the n-th of its provider, by frame address or by the slot its loader filled. */
export function matchUse(use: Pick<EmbedUse, 'provider'>, embeds: readonly LiveEmbed[], ordinal = 0): number {
	const providerOf = (e: LiveEmbed) => (e.role === 'widget' ? e.src.slice('slot:'.length) : e.role === 'component' ? undefined : (frameProvider(e.src)?.provider.id ?? (URL.parse(e.src) ? `host:${new URL(e.src).hostname}` : undefined)));
	const matching = embeds.flatMap((e, i) => (providerOf(e) === use.provider ? [i] : []));
	return matching[ordinal] ?? -1;
}

const SCHEMES = ['light', 'dark'] as const;
const STATES: readonly EmbedState[] = ['rest', 'hover', 'focus'];

function studyText(use: EmbedUse, study: Omit<EmbedStudy, 'notes'>, dir: string): string {
	const lines = [
		`# ${use.id}: ${use.providerName} (${use.form})`,
		'',
		`On ${use.routes.length} route(s): ${use.routes.slice(0, 8).join(', ')}${use.routes.length > 8 ? ' ...' : ''}. Studied on ${study.route}.`,
		`Plan: ${embedPlan(use)}.`,
		`Terms: ${use.terms.note}${use.terms.url ? ` (${use.terms.url})` : ''}.`,
		'',
		'## What to build',
		'',
		`A Markless component whose root carries \`data-markless-embed="${use.id}"\` and has the embed's exact box (${Object.entries(study.boxes).map(([k, b]) => `${k} ${b.width}x${b.height}`).join(', ') || 'see the pictures'}), in real markup: real text, images and CSS fed by data.json, never a screenshot of the embed.`,
		'Match the pictures below pixel for pixel at rest, hovered and focused, in each viewport and colour scheme; `check` compares them and writes old, new and diff images to check/.',
		`Activation (a click on its middle, or Enter on its first control) must do what the old embed does: ${study.activation ? describeActivation(study.activation) : 'see activation.json'}. Load the original embed unchanged in its place when it plays or loads, or link where it links.`,
		'Ship no JavaScript at load beyond the handler Markless resumes on the first event.',
		'',
		'## Files',
		'',
		...study.shots.map((s) => `- ${s}`),
		`- ${join(dir, 'data.json')}: what the embed shows, from ${study.data.sources.join(', ') || 'no source (see errors)'}${study.data.errors?.length ? `; errors: ${study.data.errors.join('; ')}` : ''}`,
		...(study.markup ? [`- ${join(dir, 'markup.html')}: the settled embed's markup`, `- ${join(dir, 'elements.json')}: every visible element, its box relative to the embed and the styles that draw it`] : ['- No markup was read: the provider\'s terms do not allow reading its rendered embed, so build from data.json and the pictures.']),
	];
	return `${lines.join('\n')}\n`;
}

/**
 * The study of one embed for the agent that writes its Markless component: the old page's embed, settled, pictured
 * at rest, hovered and focused at each viewport in light and dark; its markup and visible elements where the
 * provider's terms allow reading them; what a click does; and its data from the provider's API.
 */
export async function studyEmbed(browser: Browser, env: SideEnv, use: EmbedUse, viewports: readonly Viewport[], stateDir: string, ordinal = 0): Promise<EmbedStudy> {
	const dir = join(stateDir, 'embeds', use.id);
	await mkdir(join(dir, 'study'), { recursive: true });
	const route = use.routes[0]!;
	const shots: string[] = [];
	const boxes: Record<string, { width: number; height: number }> = {};
	let markup: string | undefined;
	let elements: VisibleElement[] | undefined;
	let found = false;
	for (const viewport of viewports) {
		for (const scheme of SCHEMES) {
			const side = await openSide(browser, env, route, viewport, scheme, { study: use.terms.study });
			try {
				const index = matchUse(use, side.embeds, ordinal);
				if (index < 0) continue;
				found = true;
				boxes[viewport.name] = { width: side.embeds[index]!.box.width, height: side.embeds[index]!.box.height };
				for (const state of STATES) {
					const shot = await stateShot(side, index, state, 6000);
					if (!shot) continue;
					const file = join(dir, 'study', `${viewport.name}-${scheme}-${state}.png`);
					await writeFile(file, shot.png);
					shots.push(file);
				}
				if (use.terms.study && viewport === viewports[0] && scheme === 'light') {
					const el = await target(side, index);
					const handle = await el.elementHandle({ timeout: 2000 }).catch(() => null);
					const frame: Frame | null = (await handle?.contentFrame().catch(() => null)) ?? null;
					markup = frame ? await frame.content().catch(() => undefined) : await side.page.evaluate(markupWithShadow, '[data-markless-migrate-target]');
					elements = frame ? await frame.evaluate(visibleElements, null).catch(() => undefined) : await side.page.evaluate(visibleElements, '[data-markless-migrate-target]');
				}
			} finally {
				await side.close();
			}
		}
	}
	let activation: Activation | undefined;
	if (found) {
		const side = await openSide(browser, env, route, viewports[0]!, 'light', { live: true });
		try {
			activation = await activate(side, matchUse(use, side.embeds, ordinal), 'click');
		} finally {
			await side.close();
		}
	}
	const data = await embedData(use, { cacheDir: join(stateDir, 'embeds') });
	const study = { id: use.id, route, found, boxes, shots, ...(markup ? { markup: 'markup.html' } : {}), ...(elements ? { elements } : {}), ...(activation ? { activation } : {}), data };
	const notes = found ? [] : [`the embed was not found on ${route} once the page settled`];
	if (markup) await writeFile(join(dir, 'markup.html'), markup);
	if (elements) await writeFile(join(dir, 'elements.json'), `${JSON.stringify(elements, null, '\t')}\n`);
	if (activation) await writeFile(join(dir, 'activation.json'), `${JSON.stringify(activation, null, '\t')}\n`);
	await writeFile(join(dir, 'study.json'), `${JSON.stringify({ ...study, elements: undefined, notes }, null, '\t')}\n`);
	await writeFile(join(dir, 'study.md'), studyText(use, study, dir));
	return { ...study, notes };
}
