import { attr, walk, type Element } from './dom.ts';
import { lit, type Binding } from './tsrx.ts';

/**
 * Radix Tabs on Markless state: each tab list becomes one state() in the component that renders it, holding the active
 * tab's value (the suffix of Radix's `…-content-<value>` ids). Triggers bind aria-selected and data-state and activate
 * on mousedown, focus, Enter and Space as Radix does; the arrows only move focus (roving.ts). Each panel binds
 * data-state and hidden over its content (what the old page showed in it, captured for the panels shown on use),
 * rendered always: an @if arm cannot hold captured markup, whose literal text containers count as bindings. Nothing is
 * written to the DOM by hand.
 */
export class TabsPlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** `content` gives a panel's revealed markup (tsrx) when the old page filled it on use. */
	add(root: Element, isRadixTab: (el: Element) => boolean, content: (panel: Element) => string | undefined): number {
		const byId = new Map<string, Element>();
		for (const el of walk(root)) {
			const id = attr(el, 'id');
			if (id) byId.set(id, el);
		}
		let groups = 0;
		for (const list of walk(root)) {
			if (attr(list, 'role') !== 'tablist') continue;
			const triggers = [...walk(list)].filter((t) => attr(t, 'role') === 'tab' && isRadixTab(t));
			const own = triggers.filter((t) => {
				let n = t.parentNode as Element | null;
				while (n && attr(n, 'role') !== 'tablist') n = n.parentNode as Element | null;
				return n === list;
			});
			const tabs = own.map((t) => ({ trigger: t, panelId: attr(t, 'aria-controls') ?? '', value: /-content-(.+)$/.exec(attr(t, 'aria-controls') ?? '')?.[1] })).filter((t) => t.value !== undefined);
			if (!tabs.length) continue;
			const active = tabs.find((t) => attr(t.trigger, 'aria-selected') === 'true') ?? tabs[0]!;
			const name = `tab${this.n++}`;
			const declare = [`let ${name} = state(${lit(active.value!)});`];
			groups++;
			for (const tab of tabs) {
				const v = lit(tab.value!);
				this.bindings.set(tab.trigger, {
					declare,
					omit: ['aria-selected', 'data-state'],
					extra: [
						`aria-selected={${name} === ${v} ? "true" : "false"}`,
						`data-state={${name} === ${v} ? "active" : "inactive"}`,
						`onMouseDown={(event) => { if (event.button === 0 && !event.ctrlKey) ${name} = ${v}; }}`,
						`onFocus={() => (${name} = ${v})}`,
						`onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') ${name} = ${v}; else roving(event); }}`,
					],
				});
				const panel = byId.get(tab.panelId);
				if (!panel) continue;
				const revealed = content(panel);
				this.bindings.set(panel, {
					declare,
					omit: ['data-state', 'hidden'],
					extra: [`data-state={${name} === ${v} ? "active" : "inactive"}`, `hidden={${name} !== ${v}}`],
					...(revealed !== undefined ? { children: revealed } : {}),
				});
			}
		}
		return groups;
	}
}

/**
 * Radix Accordion (type single, collapsible unless an open trigger is aria-disabled) and Collapsible on Markless state:
 * the open item's key in one state() per accordion (a boolean per collapsible), and the item closing in another while
 * its exit animation runs. Trigger, item and header bind aria-expanded and data-state; the content binds data-state and
 * hidden (shown while open or closing), and disclosure-motion.ts measures it as it is shown and ends the exit.
 */
export class DisclosurePlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Element, isRadixDisclosure: (el: Element) => boolean, content: (panel: Element) => string | undefined): number {
		const byId = new Map<string, Element>();
		for (const el of walk(root)) {
			const id = attr(el, 'id');
			if (id) byId.set(id, el);
		}
		const groups = new Map<Element, { trigger: Element; content: Element; item?: Element; header?: Element }[]>();
		for (const trigger of walk(root)) {
			if (!/-trigger$/.test(attr(trigger, 'data-slot') ?? '') || attr(trigger, 'aria-expanded') === undefined || !isRadixDisclosure(trigger)) continue;
			const panel = byId.get(attr(trigger, 'aria-controls') ?? '');
			if (!panel) continue;
			let accordion: Element | undefined;
			let item: Element | undefined;
			for (let n = trigger.parentNode as Element | null; n && 'tagName' in n; n = n.parentNode as Element | null) {
				const slot = attr(n, 'data-slot') ?? '';
				if (!item && /-item$/.test(slot)) item = n;
				if (slot === 'accordion') {
					accordion = n;
					break;
				}
			}
			const parent = trigger.parentNode as Element | null;
			const header = parent && /^h[1-6]$/.test(parent.tagName ?? '') ? parent : undefined;
			const key = accordion ?? trigger;
			const list = groups.get(key) ?? groups.set(key, []).get(key)!;
			list.push({ trigger, content: panel, ...(accordion && item ? { item } : {}), ...(header ? { header } : {}) });
		}
		for (const [, items] of groups) {
			const n = this.n++;
			const open = `acc${n}`;
			const closing = `acc${n}x`;
			const initial = items.findIndex((i) => attr(i.trigger, 'aria-expanded') === 'true');
			const collapsible = !items.some((i) => attr(i.trigger, 'aria-expanded') === 'true' && attr(i.trigger, 'aria-disabled') === 'true');
			const declare = [`let ${open} = state(${initial >= 0 ? initial : -1});`, `let ${closing} = state(-1);`];
			items.forEach((i, k) => {
				const isOpen = `${open} === ${k}`;
				const shown = `(${open} === ${k} || ${closing} === ${k})`;
				const id = attr(i.content, 'id') ?? '';
				const toggle = collapsible ? `${open} === ${k} ? -1 : ${k}` : `${k}`;
				this.bindings.set(i.trigger, {
					declare,
					omit: ['aria-expanded', 'data-state', ...(collapsible ? [] : ['aria-disabled'])],
					extra: [
						`aria-expanded={${isOpen} ? "true" : "false"}`,
						`data-state={${isOpen} ? "open" : "closed"}`,
						...(collapsible ? [] : [`aria-disabled={${isOpen} ? "true" : undefined}`]),
						`onClick={() => { const was = ${open}; ${open} = ${toggle}; if (${open} === ${k}) measureWhenShown(${lit(id)}); if (was >= 0 && was !== ${open}) { ${closing} = was; afterExit(${lit(id)}, () => { if (${closing} === was) ${closing} = -1; }); } }}`,
						`onKeyDown={(event) => accordionKeys(event)}`,
					],
				});
				for (const el of [i.item, i.header]) if (el) this.bindings.set(el, { declare, omit: ['data-state'], extra: [`data-state={${isOpen} ? "open" : "closed"}`] });
				const revealed = content(i.content);
				this.bindings.set(i.content, {
					declare,
					omit: ['data-state', 'hidden'],
					extra: [`data-state={${isOpen} ? "open" : "closed"}`, `hidden={!${shown}}`],
					...(revealed !== undefined ? { children: revealed } : {}),
				});
			});
		}
		return groups.size;
	}
}

/**
 * Base UI Select's shown value on Markless state: the trigger's value element renders one state() the trigger's
 * `mmchoose` handler sets, which the select part dispatches with the chosen option's text.
 */
export class SelectPlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Element, isBaseSelect: (el: Element) => boolean): number {
		let count = 0;
		for (const trigger of walk(root)) {
			if (attr(trigger, 'data-slot') !== 'select-trigger' || !isBaseSelect(trigger)) continue;
			const value = [...walk(trigger)].find((el) => attr(el, 'data-slot') === 'select-value');
			if (!value) continue;
			const name = `sel${this.n++}`;
			const text = textOf(value);
			const declare = [`let ${name} = state(${lit(text)});`];
			this.bindings.set(trigger, { declare, extra: [`onMmchoose={(event) => (${name} = (event as CustomEvent<string>).detail)}`] });
			this.bindings.set(value, { declare, children: `{${name}}` });
			count++;
		}
		return count;
	}
}

function textOf(el: Element): string {
	return el.childNodes.map((n) => (n.nodeName === '#text' ? (n as unknown as { value: string }).value : 'tagName' in n ? textOf(n as Element) : '')).join('');
}
