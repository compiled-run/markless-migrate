import { selectors } from 'playwright';

/** Where an element with no name is: its tag, the roles and landmarks around it, and its place among the shown elements of that tag there. */
export interface Structure {
	readonly tag: string;
	readonly scope: string;
	readonly index: number;
}

export const STRUCTURE_ENGINE = 'markless-migrate-structure';

// A Playwright selector engine, run in the page: must stay self-contained (the same scope as clickables() in journeys.ts computes).
function structureEngine() {
	const LANDMARK: Record<string, string> = { main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', dialog: 'dialog', figure: 'figure', svg: 'svg', ul: 'list', ol: 'list' };
	const scopeOf = (el: Element) => {
		const parts: string[] = [];
		for (let at = el.parentElement; at; at = at.parentElement) {
			const role = at.getAttribute('role') ?? LANDMARK[at.localName];
			if (role && role !== 'presentation' && role !== 'none' && role !== 'generic') parts.unshift(role);
		}
		return parts.join('>');
	};
	const all = (root: Element | Document, selector: string): Element[] => {
		const { tag, scope, index } = JSON.parse(selector) as Structure;
		const found = [...root.querySelectorAll(tag)].filter((el) => scopeOf(el) === scope && el.checkVisibility({ visibilityProperty: true }));
		return found[index] ? [found[index]] : [];
	};
	return { query: (root: Element | Document, selector: string) => all(root, selector)[0] ?? null, queryAll: all };
}

let registered: Promise<void> | undefined;
/** Registers the engine once per process, before the first page is opened. */
export function registerStructure(): Promise<void> {
	registered ??= selectors.register(STRUCTURE_ENGINE, structureEngine).catch((error: Error) => {
		if (!/already registered/i.test(error.message)) throw error;
	});
	return registered;
}

export const describeStructure = (s: Structure) => `<${s.tag}> #${s.index + 1}${s.scope ? ` in ${s.scope}` : ''}`;
