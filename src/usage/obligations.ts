import { colorModeCycle } from './themes.ts';
import type { Behaviour, Mechanism, Obligation, ObligationStep } from './types.ts';

/**
 * What in check performs each kind of obligation, and whether this checker has it. An obligation whose mechanism is
 * not available is listed as unchecked: coverage counts it as used and not checked, never as passed.
 */
export const MECHANISMS: Readonly<Record<Mechanism, { readonly what: string; readonly available: boolean }>> = {
	journey: { what: 'behaviour: a journey uses the control once and compares the DOM, URL, requests, focus and storage after it', available: true },
	keyboard: { what: 'a11y: every keyboard path (Enter, Space, Escape, arrows) on the control', available: true },
	motion: { what: 'motion: the transitions and animations an interaction starts, timed', available: true },
	'css-states': { what: 'css: computed styles in each media state the old stylesheets style', available: true },
	storage: { what: 'behaviour: what the page keeps in localStorage, sessionStorage and cookies after each step', available: true },
	'client-guard': { what: 'guard page: static assets byte for byte, inline styles and the box of every frame and sized element', available: true },
	sequence: { what: 'short action sequences: the same control two and three times, close by every path during and after its animation', available: false },
	'pinned-frames': { what: 'pinned frames: every element at fixed offsets of an animation and one frame after its end', available: false },
	'navigation-equivalence': { what: 'in-place navigation must equal a fresh load of the same page', available: false },
	'scheme-sequence': { what: 'a sequence repeated under the OS light and dark colour schemes', available: false },
	'load-state': { what: 'loads with stored state and OS settings preset, compared at first paint', available: false },
};

const firstSite = (b: Behaviour) => {
	const s = b.sites[0];
	return s && 'element' in s ? s.element : String(b.details.on ?? b.feature);
};

function obligation(b: Behaviour, n: number, text: string, mechanism: Mechanism, steps: ObligationStep[]): Obligation {
	return { id: `${b.id}#${n}`, behaviour: b.id, text, mechanism, steps, routes: b.routes.slice(0, 1) };
}

/** The checks one behaviour must pass, from its kind and what the inventory read about it. */
export function obligationsFor(b: Behaviour): Obligation[] {
	const target = firstSite(b);
	const o: Obligation[] = [];
	const add = (text: string, mechanism: Mechanism, steps: ObligationStep[]) => o.push(obligation(b, o.length + 1, text, mechanism, steps));
	switch (b.kind) {
		case 'color-mode': {
			const cycle = colorModeCycle(b.library as 'docusaurus-theme', b.details.settings as Record<string, unknown> | undefined);
			const clicks = cycle.length;
			for (const scheme of ['light', 'dark'] as const) add(`theme toggle: click ${target} ${clicks} times (one full cycle: ${cycle.join(' → ')} → ${cycle[0]}) with the OS in ${scheme} mode; after every click, <html>'s theme attributes, the stored choice, the toggle's label and the page colours match`, 'scheme-sequence', [{ do: 'load', emulate: { colorScheme: scheme } }, { do: 'click', target, times: clicks }, { do: 'compare', what: ['html attributes', 'localStorage', 'accessible name', 'computed colors'], at: ['after each click'] }]);
			add(`theme toggle: switch the theme, then navigate in place to another page: the theme equals a fresh load of that page`, 'navigation-equivalence', [{ do: 'click', target }, { do: 'navigate-in-place', to: 'another page' }, { do: 'compare', what: ['html attributes', 'computed colors'] }]);
			add(`theme toggle: one click, compared as a journey`, 'journey', [{ do: 'click', target }, { do: 'compare', what: ['html attributes', 'localStorage'] }]);
			break;
		}
		case 'theme-init': {
			const key = ((b.details.effects as { kind: string; key?: string }[] | undefined) ?? []).find((e) => e.kind === 'storage' && e.key)?.key ?? 'theme';
			for (const stored of ['light', 'dark', 'system', 'none'])
				add(`theme on load: ${stored === 'none' ? `nothing stored under "${key}"` : `"${key}" = ${stored}`}, under the OS light and dark schemes: <html>'s theme attributes at first paint match (no flash of the other theme)`, 'load-state', [{ do: 'load', emulate: { colorScheme: 'light', ...(stored === 'none' ? {} : { storage: { [key]: stored } }) } }, { do: 'load', emulate: { colorScheme: 'dark', ...(stored === 'none' ? {} : { storage: { [key]: stored } }) } }, { do: 'compare', what: ['html attributes at first paint'] }]);
			break;
		}
		case 'dialog':
		case 'search':
			add(`${b.feature}: open from ${target}, then close by Escape, by clicking the backdrop and by its close button, each during and after the open animation; focus returns to the opener`, 'sequence', [{ do: 'click', target }, { do: 'press', target: 'dialog', key: 'Escape' }, { do: 'click', target }, { do: 'click', target: 'backdrop' }, { do: 'compare', what: ['DOM', 'focus', 'scroll lock'] }]);
			add(`${b.feature}: one frame after the close animation ends, the backdrop and the content are gone (no flash back)`, 'pinned-frames', [{ do: 'click', target }, { do: 'press', target: 'dialog', key: 'Escape' }, { do: 'compare', what: ['opacity', 'visibility', 'box'], at: ['0', '25%', '50%', '75%', 'end', 'end + 1 frame'] }]);
			add(`${b.feature}: Tab stays inside while open; Escape closes`, 'keyboard', [{ do: 'click', target }, { do: 'press', target: 'dialog', key: 'Tab', times: 3 }]);
			add(`${b.feature}: open once, compared as a journey`, 'journey', [{ do: 'click', target }]);
			break;
		case 'disclosure':
		case 'sidebar':
		case 'navbar':
		case 'show-hide':
		case 'toggle':
			add(`${b.feature} on ${target}: use it twice and three times; after two it is back where it started, after each the DOM and classes match`, 'sequence', [{ do: 'click', target, times: 3 }, { do: 'compare', what: ['DOM', 'classes'], at: ['after each click'] }]);
			add(`${b.feature} on ${target}: the open and close animation, pinned at fixed offsets and one frame after its end`, 'pinned-frames', [{ do: 'click', target }, { do: 'compare', what: ['opacity', 'transform', 'box'], at: ['0', '50%', 'end', 'end + 1 frame'] }]);
			add(`${b.feature} on ${target}: one use, compared as a journey`, 'journey', [{ do: 'click', target }]);
			add(`${b.feature} on ${target}: its transitions timed`, 'motion', [{ do: 'click', target }]);
			break;
		case 'tabs':
		case 'menu':
			add(`${b.feature} on ${target}: each tab or item by click`, 'journey', [{ do: 'click', target }]);
			add(`${b.feature} on ${target}: arrow keys, Home, End and Escape`, 'keyboard', [{ do: 'press', target, key: 'ArrowRight' }]);
			add(`${b.feature} on ${target}: open, then close by Escape and by clicking outside, twice`, 'sequence', [{ do: 'click', target, times: 2 }, { do: 'press', target, key: 'Escape' }]);
			break;
		case 'class-timeline': {
			const steps = (b.details.steps as { op: string; className: string; delay: string }[] | undefined) ?? [];
			add(`${target}: ${steps.map((s) => `${s.op} .${s.className} at ${s.delay}`).join(', ') || 'class changes'}; the element's classes and opacity pinned at each step's time`, 'pinned-frames', [{ do: 'load' }, { do: 'compare', what: ['classes', 'opacity', 'transform'], at: steps.map((s) => s.delay) }]);
			add(`${target}: the transitions those classes start, timed`, 'motion', [{ do: 'load' }]);
			break;
		}
		case 'request': {
			const triggers = (b.details.triggers as { event: string }[] | undefined) ?? [];
			add(`${triggers.map((t) => t.event).join(' or ')} on ${target}: the same request (${String(b.details.method)} ${String(b.details.url)}, its parameters and headers) and the same DOM after the swap`, 'journey', [{ do: 'click', target }, { do: 'compare', what: ['requests', 'DOM', 'focus', 'URL'] }]);
			if (triggers.some((t) => t.event === 'every' || t.event === 'load' || t.event === 'revealed' || t.event === 'intersect')) add(`${target}: requests started without a click (${triggers.map((t) => t.event).join(', ')}) at the same times`, 'pinned-frames', [{ do: 'load' }, { do: 'wait', ms: 2000 }, { do: 'compare', what: ['requests', 'DOM'] }]);
			add(`${target}: trigger it twice in a row: the same requests in the same order (no doubled fetch)`, 'sequence', [{ do: 'click', target, times: 2 }, { do: 'compare', what: ['requests'] }]);
			break;
		}
		case 'boost':
			add(`boosted links inside ${target}: following one equals a fresh load of the next page (head, body, scripts run)`, 'navigation-equivalence', [{ do: 'click', target: 'a boosted link' }, { do: 'compare', what: ['head', 'DOM', 'title', 'history'] }]);
			add(`boosted links inside ${target}: the URL, history entry and requests of one click`, 'journey', [{ do: 'click', target: 'a boosted link' }]);
			break;
		case 'navigation':
			add(`${b.feature} on ${target}: the same requests ahead of the click (prefetch), and the next page shows as soon`, 'journey', [{ do: 'hover', target }, { do: 'compare', what: ['requests'] }]);
			break;
		case 'embed-frame':
			add(`${b.feature}: the frame's box (width and height) and inline style equal the old page's, and so do the element and address that frame it`, 'client-guard', [{ do: 'load' }, { do: 'wait', ms: 1500 }, { do: 'compare', what: ['frame box', 'inline style', 'src origin and path'] }]);
			break;
		case 'copy':
			add(`${b.feature} on ${target}: click, the label changes and comes back as on the old page`, 'journey', [{ do: 'click', target }]);
			add(`${b.feature}: clicked twice in a row`, 'sequence', [{ do: 'click', target, times: 2 }]);
			break;
		case 'dismiss':
			add(`${b.feature}: close it; it stays closed after a reload`, 'storage', [{ do: 'click', target }, { do: 'load' }, { do: 'compare', what: ['DOM', 'localStorage'] }]);
			break;
		case 'scroll':
		case 'toc':
		case 'observer':
			add(`${b.feature}: scroll to fixed positions; what is highlighted or shown at each matches`, 'sequence', [{ do: 'scroll', target: 'page', times: 3 }, { do: 'compare', what: ['classes', 'visibility'] }]);
			break;
		case 'storage':
			add(`${b.summary}: the same key read or written`, 'storage', [{ do: 'load' }, { do: 'compare', what: ['storage keys'] }]);
			break;
		case 'media-query':
			add(`${b.summary}: loaded with the query true and false, the page matches`, /prefers-color-scheme/.test(String(b.details.query)) ? 'scheme-sequence' : 'load-state', [{ do: 'load' }]);
			break;
		case 'timer':
			add(`${b.summary}: what it changes, pinned at the same times`, 'pinned-frames', [{ do: 'load' }, { do: 'wait', ms: Number(b.details.ms ?? 1000) + 50 }]);
			break;
		case 'fetch':
			add(`${b.summary}: the same request`, 'journey', [{ do: 'load' }, { do: 'compare', what: ['requests'] }]);
			break;
		default:
			add(`${b.feature} on ${target}: used once, compared as a journey`, 'journey', [{ do: 'click', target }]);
	}
	return o;
}

export const isCheckable = (o: Obligation): boolean => MECHANISMS[o.mechanism].available;
