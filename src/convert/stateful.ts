import { attr, walk, type Element } from './dom.ts';
import { lit, type Binding } from './tsrx.ts';
import type { ToggleGroup } from './toggles.ts';

/**
 * Radix Tabs on Markless state: each tab list becomes one state() in the component that renders it, holding the active
 * tab's value (the suffix of Radix's `…-content-<value>` ids). Triggers bind aria-selected and data-state and activate
 * on mousedown, focus, Enter and Space as Radix does; the arrows only move focus (roving.ts). Each panel binds
 * data-state and hidden, and its content (what the old page showed in it, captured for the panels shown on use) is an
 * @if arm, so an inactive panel holds nothing, as Radix unmounts it. Nothing is written to the DOM by hand.
 */
// An arm is rebuilt from its own markup: content holding another branch, a component (one with state or per-page
// values has to run), or attributes bound to a shared component's per-page values stays rendered, hidden instead.
function armed(test: string, inner: string): string {
	return /@(if|switch|for) \(|\bvalues\[|<[A-Z]\w*[\s/>]/.test(inner) ? inner : `@if (${test}) { <>${inner}</> }`;
}

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
					wrap: (inner) => armed(`${name} === ${v}`, inner),
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
 * hidden, its content is an @if arm rendered while open or closing, and disclosure-motion.ts measures it as it is
 * shown and ends the exit.
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
					wrap: (inner) => armed(shown, inner),
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

/**
 * Controls that switch state in place on Markless state (checkboxes, switches, pressed toggles, radios and
 * single-choice toggle groups), from the states the old page showed when each was used (toggles.ts): a state() per
 * control (per group for radios), each attribute that differs between the states bound to it, and the children an
 * @if arm per state when they differ (a checkbox's indicator). A hidden native input beside the control (Base UI's,
 * the target of its label) binds `checked` and switches the state too.
 */
export class CheckablePlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Element, groups: readonly ToggleGroup[], locate: (sig: string, nth: number) => Element | undefined, emit: (html: string) => string): number {
		let placed = 0;
		for (const group of groups) {
			const els = group.controls.map((c) => locate(c.sig, c.nth));
			if (els.some((el) => !el || this.bindings.has(el))) continue;
			const name = `${group.kind === 'radio' ? 'rg' : 'tg'}${this.n++}`;
			const initial = group.controls.findIndex((c) => c.initial);
			const declare = [group.kind === 'radio' ? `let ${name} = state(${initial});` : `let ${name} = state(${group.controls[0]!.initial});`];
			group.controls.forEach((c, k) => {
				const el = els[k]!;
				const on = group.kind === 'radio' ? `${name} === ${k}` : name;
				const choose = group.kind === 'radio' ? (group.clears ? `${name} = ${name} === ${k} ? -1 : ${k}` : `${name} = ${k}`) : `${name} = !${name}`;
				const names = [...new Set([...Object.keys(c.on.attrs), ...Object.keys(c.off.attrs)])].filter((a) => c.on.attrs[a] !== c.off.attrs[a] && /^[A-Za-z_][\w.-]*$/.test(a));
				const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
				const keys = el.tagName === 'button' || el.tagName === 'input' ? [] : group.kind === 'radio' ? [`onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); ${choose}; } else radioKeys(event, ${!group.clears}); }}`] : [`onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); ${choose}; } }}`];
				const radioRoving = el.tagName === 'button' && group.kind === 'radio' ? [`onKeyDown={(event) => radioKeys(event, ${!group.clears})}`] : [];
				this.bindings.set(el, {
					declare,
					omit: names,
					extra: [...names.map((a) => `${a}={${on} ? ${value(c.on.attrs[a])} : ${value(c.off.attrs[a])}}`), `onClick={() => { ${choose}; }}`, ...keys, ...radioRoving],
					...(c.on.inner !== c.off.inner ? { children: `@if (${on}) { <>${emit(c.on.inner)}</> } @else { <>${emit(c.off.inner)}</> }` } : {}),
				});
				const parent = el.parentNode as Element | null;
				const siblings = parent && 'childNodes' in parent ? parent.childNodes.filter((x): x is Element => 'tagName' in x) : [];
				const input = siblings[siblings.indexOf(el) + 1];
				if (input && input.tagName === 'input' && attr(input, 'aria-hidden') === 'true' && /^(checkbox|radio)$/.test(attr(input, 'type') ?? '')) {
					this.bindings.set(input, { declare, omit: ['checked'], extra: [`checked={${on}}`, `onClick={() => { ${group.kind === 'radio' ? `${name} = ${k}` : choose}; }}`] });
				}
			});
			placed++;
		}
		return placed;
	}
}

/**
 * Base UI Tabs on Markless state: the chosen tab's index and the direction of the last change (Base UI's
 * data-activation-direction) in two state()s per tab list. Triggers bind aria-selected, tabindex, data-active and
 * aria-controls; Base UI renders only the chosen panel, so the panel element binds the chosen panel's id, label and
 * index and renders the content each tab showed on the old page (captured by choosing it) in an @if arm.
 */
export class BaseTabsPlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Element, isBaseTab: (el: Element) => boolean, revealed: (trigger: Element) => { readonly attrs: Readonly<Record<string, string>>; readonly inner: string } | undefined, emit: (html: string) => string): number {
		let groups = 0;
		for (const list of walk(root)) {
			if (attr(list, 'role') !== 'tablist') continue;
			const triggers = [...walk(list)].filter((t) => attr(t, 'role') === 'tab' && isBaseTab(t));
			if (triggers.length < 2) continue;
			const active = triggers.findIndex((t) => attr(t, 'aria-selected') === 'true');
			const tabs = list.parentNode as Element | null;
			if (active < 0 || !tabs || !('tagName' in tabs)) continue;
			const activeId = attr(triggers[active]!, 'id');
			const panel = [...walk(tabs)].find((p) => attr(p, 'role') === 'tabpanel' && attr(p, 'aria-labelledby') === activeId);
			if (!panel) continue;
			const own = { attrs: Object.fromEntries(panel.attrs.map((a) => [a.name, a.value])), inner: '' };
			const panels = triggers.map((t, k) => (k === active ? own : revealed(t)));
			if (panels.some((p) => !p)) continue;
			const contents = panels.map((p, k) => (k === active ? undefined : emit(p!.inner)));
			if (contents.some((c) => c !== undefined && /@(if|switch|for) \(|<[A-Z]\w*[\s/>]/.test(c))) continue;
			const name = `btab${this.n++}`;
			const dir = `${name}d`;
			const vertical = attr(list, 'data-orientation') === 'vertical';
			const declare = [`let ${name} = state(${active});`, `let ${dir} = state(${lit(attr(list, 'data-activation-direction') ?? 'none')});`];
			const pick = (values: readonly (string | undefined)[]) => values.reduceRight<string>((rest, v, k) => (k === values.length - 1 ? (v === undefined ? 'undefined' : lit(v)) : `${name} === ${k} ? ${v === undefined ? 'undefined' : lit(v)} : ${rest}`), '');
			const direction = `data-activation-direction={${dir}}`;
			for (const el of [tabs, list]) if (attr(el, 'data-activation-direction') !== undefined) this.bindings.set(el, { declare, omit: ['data-activation-direction'], extra: [direction] });
			const panelId = (k: number) => panels[k]!.attrs['id'];
			triggers.forEach((t, k) => {
				const choose = `${dir} = ${k} > ${name} ? ${lit(vertical ? 'down' : 'right')} : ${k} < ${name} ? ${lit(vertical ? 'up' : 'left')} : ${dir}; ${name} = ${k};`;
				this.bindings.set(t, {
					declare,
					omit: ['aria-selected', 'tabindex', 'data-active', 'data-composite-item-active', 'aria-controls', 'data-activation-direction'],
					extra: [
						`aria-selected={${name} === ${k} ? "true" : "false"}`,
						`tabindex={${name} === ${k} ? "0" : "-1"}`,
						`data-active={${name} === ${k} ? "" : undefined}`,
						`data-composite-item-active={${name} === ${k} ? "" : undefined}`,
						`aria-controls={${name} === ${k} ? ${lit(panelId(k) ?? '')} : undefined}`,
						direction,
						`onClick={() => { ${choose} }}`,
						`onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${choose} } else roving(event); }}`,
					],
				});
			});
			const varying = [...new Set(panels.flatMap((p) => Object.keys(p!.attrs)))].filter((a) => a !== 'data-activation-direction' && new Set(panels.map((p) => p!.attrs[a])).size > 1);
			this.bindings.set(panel, {
				declare,
				omit: [...varying, 'data-activation-direction'],
				extra: [...varying.map((a) => `${a}={${pick(panels.map((p) => p!.attrs[a]))}}`), direction],
				// The chosen panel's own content, when Markless cannot rebuild it in an arm, stays as the only content.
				wrap: (inner) => (/@(if|switch|for) \(|\bvalues\[|<[A-Z]\w*[\s/>]/.test(inner) ? inner : contents.map((c, k) => `@if (${name} === ${k}) { <>${c ?? inner}</> }`).join('')),
			});
			groups++;
		}
		return groups;
	}
}

/**
 * Disclosures that mount their content where it opens (Base UI Collapsible and Accordion, a Radix Collapsible whose
 * content leaves while closed) on Markless state: one state() per trigger, or per accordion where one item opens at a
 * time, the trigger binding aria-expanded (and data-state, Base UI's data-panel-open) and the content the old page
 * mounted on opening rendered in an @if arm at the place it went.
 */
export class InsertedDisclosurePlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(items: readonly { readonly trigger: Element; readonly parent: Element; readonly before: Element | null; readonly markup: string }[]): number {
		const byTrigger = new Map<Element, (typeof items)[number][]>();
		for (const i of items) (byTrigger.get(i.trigger) ?? byTrigger.set(i.trigger, []).get(i.trigger)!).push(i);
		const accordionOf = (el: Element) => {
			for (let n = el.parentNode as Element | null; n && 'tagName' in n; n = n.parentNode as Element | null) if (attr(n, 'data-slot') === 'accordion') return n;
			return undefined;
		};
		const groups = new Map<Element, Element[]>();
		for (const trigger of byTrigger.keys()) {
			if (this.bindings.has(trigger)) continue;
			const key = accordionOf(trigger) ?? trigger;
			// A group key is the accordion, or the trigger itself for a standalone disclosure.
			(groups.get(key) ?? groups.set(key, []).get(key)!).push(trigger);
		}
		const inserts = new Map<Element, { before: Element | null; markup: string; declare: string[] }[]>();
		for (const [key, closed] of groups) {
			// An accordion's item open on load has its content in the page already (named by aria-controls): it closes
			// when another opens, hidden by its bound attribute.
			const openItems = key === closed[0] ? [] : [...walk(key)].filter((t) => attr(t, 'aria-expanded') === 'true' && attr(t, 'aria-haspopup') === undefined && accordionOf(t) === key && !this.bindings.has(t));
			const panels = new Map<Element, Element>();
			for (const t of openItems) {
				const id = attr(t, 'aria-controls');
				const panel = id ? [...walk(key)].find((p) => attr(p, 'id') === id) : undefined;
				if (panel) panels.set(t, panel);
			}
			const triggers = [...closed, ...openItems.filter((t) => panels.has(t))];
			const name = `ins${this.n++}`;
			const single = key !== closed[0] && triggers.length > 1;
			const initial = triggers.findIndex((t) => panels.has(t));
			const declare = [`let ${name} = state(${single ? initial : 'false'});`];
			triggers.forEach((trigger, k) => {
				const open = single ? `${name} === ${k}` : name;
				const toggle = single ? `${name} = ${name} === ${k} ? -1 : ${k}` : `${name} = !${name}`;
				const base = /^base-ui-/.test(attr(trigger, 'id') ?? '') || trigger.attrs.some((a) => a.name.startsWith('data-base-ui'));
				const extra = [`aria-expanded={${open} ? "true" : "false"}`, `onClick={() => { ${toggle}; }}`];
				const omit = ['aria-expanded'];
				if (attr(trigger, 'data-state') !== undefined) {
					extra.push(`data-state={${open} ? "open" : "closed"}`);
					omit.push('data-state');
				}
				if (base) {
					extra.push(`data-panel-open={${open} ? "" : undefined}`);
					omit.push('data-panel-open');
				}
				this.bindings.set(trigger, { declare, omit, extra });
				const panel = panels.get(trigger);
				if (panel) this.bindings.set(panel, { declare, omit: ['hidden', 'data-open', 'data-closed'], extra: [`hidden={!(${open})}`, `data-open={${open} ? "" : undefined}`, `data-closed={${open} ? undefined : ""}`] });
				for (const i of byTrigger.get(trigger) ?? []) {
					const list = inserts.get(i.parent) ?? inserts.set(i.parent, []).get(i.parent)!;
					const markup = /@(if|switch|for) \(|<[A-Z]\w*[\s/>]/.test(i.markup) ? '' : `@if (${open}) { <>${i.markup}</> }`;
					if (markup && !list.some((l) => l.before === i.before && l.markup === markup)) list.push({ before: i.before, markup, declare });
				}
			});
		}
		for (const [parent, list] of inserts) {
			const own = this.bindings.get(parent);
			this.bindings.set(parent, { ...own, declare: [...new Set([...(own?.declare ?? []), ...list.flatMap((l) => l.declare)])], inserts: list.map(({ before, markup }) => ({ before, markup })) });
		}
		return groups.size;
	}
}
