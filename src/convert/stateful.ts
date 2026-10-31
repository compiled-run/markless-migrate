import { parseFragment } from 'parse5';
import { attr, childrenOf, inner as innerOf, isElement, isText, outer as outerOf, walk, type Element, type Node } from './dom.ts';
import { lit, mergeBindings, type Binding } from './tsrx.ts';
import type { Notify, SonnerToast, Switch, ToggleGroup } from './toggles.ts';
import { SONNER_STATE } from '../../parts/sonner.ts';

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
			// One handler per event on the list, not on each trigger: Markless's build lists every handler's closure.
			const listOwn = this.bindings.get(list);
			this.bindings.set(list, {
				declare: [...(listOwn?.declare ?? []), ...declare],
				omit: listOwn?.omit ?? [],
				extra: [
					...(listOwn?.extra ?? []),
					`onMouseDown={(event) => { const v = tabValue(event); if (v !== undefined && event.button === 0 && !event.ctrlKey) ${name} = v; }}`,
					`onFocusIn={(event) => { const v = tabValue(event); if (v !== undefined) ${name} = v; }}`,
					`onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { const v = tabValue(event); if (v !== undefined) ${name} = v; } else roving(event); }}`,
				],
			});
			for (const tab of tabs) {
				const v = lit(tab.value!);
				this.bindings.set(tab.trigger, {
					declare,
					omit: ['aria-selected', 'data-state'],
					extra: [`aria-selected={${name} === ${v} ? "true" : "false"}`, `data-state={${name} === ${v} ? "active" : "inactive"}`],
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
 * Radix Accordion (collapsible unless an open trigger is aria-disabled) and Collapsible on Markless state: the open
 * item's key in one state() per accordion (per item where several can be open, per collapsible), the item closing in another while
 * its exit animation runs. Trigger, item and header bind aria-expanded and data-state; the content binds data-state and
 * hidden, its content is an @if arm rendered while open or closing, and panel-motion.ts measures it as it is shown and
 * ends the exit.
 */
/** A Radix Collapsible's or Accordion's content: its panel by data-slot, with Radix's data-state. */
export const radixDisclosurePanel = (panel: Element) => /(^|-)(collapsible|accordion)-content$/.test(attr(panel, 'data-slot') ?? '') && attr(panel, 'data-state') !== undefined;

/** Whether markup holds a Radix Collapsible or Accordion of its own: a trigger whose aria-controls names such a panel in it. */
export function holdsRadixDisclosure(roots: readonly Element[]): boolean {
	const all = roots.flatMap((r) => [r, ...walk(r)]);
	const panels = new Set(all.filter(radixDisclosurePanel).map((p) => attr(p, 'id')).filter(Boolean));
	return all.some((el) => attr(el, 'aria-expanded') !== undefined && panels.has(attr(el, 'aria-controls')));
}

export class DisclosurePlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(root: Element, isRadixDisclosure: (el: Element) => boolean, content: (panel: Element) => string | undefined, multiple: (accordion: Element) => boolean = () => false): number {
		const byId = new Map<string, Element>();
		for (const el of walk(root)) {
			const id = attr(el, 'id');
			if (id) byId.set(id, el);
		}
		const groups = new Map<Element, { trigger: Element; content: Element; item?: Element; header?: Element }[]>();
		for (const trigger of walk(root)) {
			if (attr(trigger, 'aria-expanded') === undefined) continue;
			const panel = byId.get(attr(trigger, 'aria-controls') ?? '');
			if (!panel) continue;
			// A trigger rendered through its child (asChild) carries the child's data-slot: its panel says it is Radix's.
			const own = /-trigger$/.test(attr(trigger, 'data-slot') ?? '') && isRadixDisclosure(trigger);
			if (!own && !(radixDisclosurePanel(panel) && attr(trigger, 'data-state') !== undefined)) continue;
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
			// A Collapsible's root (the nearest element around both its trigger and content) carries data-state too.
			if (!accordion) item = undefined;
			if (!accordion)
				for (let n = parent; n && 'tagName' in n; n = n.parentNode as Element | null)
					if ([...walk(n)].includes(panel)) {
						if (attr(n, 'data-state') !== undefined) item = n;
						break;
					}
			// Each item of an accordion that lets several be open is its own group; a Collapsible's triggers share its content.
			const key = accordion && !multiple(accordion) ? accordion : accordion ? trigger : panel;
			const list = groups.get(key) ?? groups.set(key, []).get(key)!;
			list.push({ trigger, content: panel, ...(item ? { item } : {}), ...(header ? { header } : {}) });
		}
		for (const [, items] of groups) {
			const n = this.n++;
			const open = `acc${n}`;
			const closing = `acc${n}x`;
			// Each content is one item, whichever of its triggers is used.
			const contents = [...new Set(items.map((i) => i.content))];
			const initial = contents.indexOf(items.find((i) => attr(i.trigger, 'aria-expanded') === 'true')?.content as Element);
			const collapsible = !items.some((i) => attr(i.trigger, 'aria-expanded') === 'true' && attr(i.trigger, 'aria-disabled') === 'true');
			const declare = [`let ${open} = state(${initial >= 0 ? initial : -1});`, `let ${closing} = state(-1);`];
			const ids = `[${contents.map((c) => lit(attr(c, 'id') ?? '')).join(', ')}]`;
			items.forEach((i) => {
				const k = contents.indexOf(i.content);
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
						`onClick={() => { const was = ${open}; ${open} = ${toggle}; if (${open} === ${k}) panelEnter(${lit(id)}); if (was >= 0 && was !== ${open}) { ${closing} = was; panelExit(${ids}[was] ?? '', () => { if (${closing} === was) ${closing} = -1; }); } }}`,
						`onKeyDown={(event) => accordionKeys(event)}`,
					],
				});
				for (const el of [i.item, i.header]) if (el) this.bindings.set(el, { declare, omit: ['data-state'], extra: [`data-state={${isOpen} ? "open" : "closed"}`] });
				// forceMount: Radix keeps a closed content mounted and shown, so only its data-state follows.
				if (attr(i.trigger, 'aria-expanded') === 'false' && attr(i.content, 'hidden') === undefined) {
					this.bindings.set(i.content, { declare, omit: ['data-state'], extra: [`data-state={${isOpen} ? "open" : "closed"}`] });
					return;
				}
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

	add(root: Element, isBaseSelect: (el: Element) => boolean, emit?: (html: string) => string): number {
		let count = 0;
		for (const trigger of walk(root)) {
			// Qwik UI's Select: its trigger in the root it renders (data-qui-select-root), its DisplayValue span marked data-value.
			const quiValue = attr(trigger, 'aria-haspopup') === 'listbox' && closestOf(trigger, (el) => attr(el, 'data-qui-select-root') !== undefined) ? [...walk(trigger)].find((el) => el !== trigger && attr(el, 'data-value') !== undefined) : undefined;
			if (quiValue) {
				const name = `sel${this.n++}`;
				const declare = [`let ${name} = state(${lit(textOf(quiValue))});`];
				this.bindings.set(trigger, { declare, extra: [`onMmchoose={(event) => (${name} = (event as CustomEvent<string>).detail)}`] });
				this.bindings.set(quiValue, { declare, children: `{${name}}` });
				count++;
				continue;
			}
			if (attr(trigger, 'data-slot') !== 'select-trigger' || !isBaseSelect(trigger)) continue;
			const value = [...walk(trigger)].find((el) => attr(el, 'data-slot') === 'select-value');
			// A trigger that renders the chosen text itself (React Aria's render function, Base UI's Value rendering bare
			// text): its leading text is the state, the rest of its children stay as they are.
			const lead = childrenOf(trigger)[0];
			if (!value && emit && lead && isText(lead) && lead.value.trim()) {
				const name = `sel${this.n++}`;
				const declare = [`let ${name} = state(${lit(lead.value)});`];
				const others = childrenOf(trigger).slice(1);
				const rest = others.map((n) => (isText(n) ? n.value.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!) : outerOf(n))).join('');
				// What the trigger showed after a choice, as convert recorded it, holds the rest's text too (an icon's).
				const tail = others.map((n) => (isText(n) ? n.value : 'tagName' in n ? textOf(n as Element) : '')).join('');
				const shown = tail ? `{ const d = (event as CustomEvent<string>).detail; ${name} = d.endsWith(${lit(tail)}) ? d.slice(0, d.length - ${tail.length}) : d; }` : `(${name} = (event as CustomEvent<string>).detail)`;
				this.bindings.set(trigger, { declare, extra: [`onMmchoose={(event) => ${shown}}`], children: `{${name}}${emit(rest)}` });
				count++;
				continue;
			}
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

function closestOf(el: Element, test: (el: Element) => boolean): Element | undefined {
	for (let at: Element | undefined = el; at && 'tagName' in at; at = at.parentNode as Element | undefined) if (test(at)) return at;
	return undefined;
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

	add(root: Element, groups: readonly ToggleGroup[], locate: (sig: string, nth: number) => Element | undefined, emit: (html: string) => string, skip: (el: Element) => boolean = () => false): number {
		let placed = 0;
		// A control another group's state reads (a select-all box) stays its own group's: it is no dependent.
		const controls = new Set(groups.flatMap((g) => g.controls.map((c) => locate(c.sig, c.nth))));
		for (const group of groups) {
			const els = group.controls.map((c) => locate(c.sig, c.nth));
			if (els.some((el) => !el || this.bindings.has(el) || skip(el))) continue;
			const name = `${group.kind === 'radio' ? 'rg' : 'tg'}${this.n++}`;
			const initial = group.controls.findIndex((c) => c.initial);
			const declare = [group.kind === 'radio' ? `let ${name} = state(${initial});` : `let ${name} = state(${group.controls[0]!.initial});`];
			group.controls.forEach((c, k) => {
				const el = els[k]!;
				const on = group.kind === 'radio' ? `${name} === ${k}` : name;
				const choose = group.kind === 'radio' ? (group.clears ? `${name} = ${name} === ${k} ? -1 : ${k}` : `${name} = ${k}`) : `${name} = !${name}`;
				// The tab stop follows focus (a roving group's part moves it), not the control's state.
				const names = [...new Set([...Object.keys(c.on.attrs), ...Object.keys(c.off.attrs)])].filter((a) => c.on.attrs[a] !== c.off.attrs[a] && a !== 'tabindex' && /^[A-Za-z_][\w.-]*$/.test(a));
				const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
				// Base UI's checkables (useButton, RadioRoot, CheckboxRoot): a radio chooses on Space as it goes down, a checkbox or
				// switch on Space as it comes up, a switch on Enter too; Enter on a checkbox submits its form instead.
				const role = attr(el, 'role');
				const keys =
					el.tagName === 'button' || el.tagName === 'input'
						? []
						: group.kind === 'radio'
							? [`onKeyDown={(event) => { if (event.key === ' ') { event.preventDefault(); ${choose}; } else if (event.key === 'Enter') event.preventDefault(); else radioKeys(event, ${!group.clears}); }}`]
							: role === 'checkbox' || role === 'switch'
								? [`onKeyDown={(event) => { if (event.key === ' ') event.preventDefault(); else if (event.key === 'Enter') { event.preventDefault(); ${role === 'switch' ? `${choose};` : 'submitForm(event);'} } }}`, `onKeyUp={(event) => { if (event.key === ' ') { ${choose}; } }}`]
								: [`onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); ${choose}; } }}`];
				// React Aria's ToggleButtonGroup and Radix's RovingFocusGroup items move focus in toggle.ts's keydown.
				// A form's Reset (parts/form-library.ts) sets each control as its defaults say, which may leave no radio chosen.
				const set = `onMmset={(event) => { ${group.kind === 'radio' ? `if ((event as CustomEvent<boolean>).detail) ${name} = ${k}; else if (${name} === ${k}) ${name} = -1;` : `${name} = (event as CustomEvent<boolean>).detail;`} }}`;
				const radioRoving = el.tagName === 'button' && group.kind === 'radio' && attr(el, 'role') === 'radio' && attr(el, 'data-rac') === undefined && attr(el, 'data-radix-collection-item') === undefined ? [`onKeyDown={(event) => radioKeys(event, ${!group.clears})}`] : [];
				// React Aria's Checkbox, Switch and Radio: a label around a visually hidden input that holds focus. A click
				// on the label reaches the input too, and Space on the input clicks it: the input's click is the one use.
				// Only the descendants that differ are bound, so the focused input is never rendered again.
				if (el.tagName === 'label' && attr(el, 'data-rac') !== undefined) {
					const pick = group.kind === 'radio' ? `${name} = ${k}` : choose;
					this.bindings.set(el, { declare, omit: names, extra: [...names.map((a) => `${a}={${on} ? ${value(c.on.attrs[a])} : ${value(c.off.attrs[a])}}`), `onClick={(event) => { if ((event.target as Element).tagName === 'INPUT') { ${pick}; } }}`, set] });
					this.diff(el, c.on.inner, c.off.inner, on, declare, emit);
					const input = [...walk(el)].find((x) => x.tagName === 'input');
					if (input) this.bindings.set(input, mergeBindings(this.bindings.get(input), { declare, omit: ['checked'], extra: [`checked={${on}}`] })!);
					return;
				}
				this.bindings.set(el, {
					declare,
					omit: names,
					extra: [...names.map((a) => `${a}={${on} ? ${value(c.on.attrs[a])} : ${value(c.off.attrs[a])}}`), `onClick={() => { ${choose}; }}`, ...keys, ...radioRoving, set],
					...(c.on.inner !== c.off.inner ? { children: `@if (${on}) { <>${emit(c.on.inner)}</> } @else { <>${emit(c.off.inner)}</> }` } : {}),
				});
				const parent = el.parentNode as Element | null;
				const siblings = parent && 'childNodes' in parent ? parent.childNodes.filter((x): x is Element => 'tagName' in x) : [];
				const input = siblings[siblings.indexOf(el) + 1];
				if (input && input.tagName === 'input' && attr(input, 'aria-hidden') === 'true' && /^(checkbox|radio)$/.test(attr(input, 'type') ?? '')) {
					// Its label's click focuses the input: Base UI hands focus on to the control.
					this.bindings.set(input, { declare, omit: ['checked'], extra: [`checked={${on}}`, `onClick={() => { ${group.kind === 'radio' ? `${name} = ${k}` : choose}; }}`, `onFocus={(event) => focusControl(event)}`] });
				}
			});
			for (const d of group.dependents ?? []) {
				const el = locate(d.sig, d.nth);
				if (!el || controls.has(el) || this.bindings.has(el) || skip(el)) continue;
				const states = Object.entries(d.states);
				const when = (state: string) => (group.kind === 'radio' ? `${name} === ${state}` : state === 'on' ? name : `!${name}`);
				const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
				const pick = (values: readonly (string | undefined)[]) => values.reduceRight<string>((rest, v, k) => (k === values.length - 1 ? value(v) : `${when(states[k]![0])} ? ${value(v)} : ${rest}`), '');
				const names = [...new Set(states.flatMap(([, st]) => Object.keys(st.attrs)))].filter((a) => new Set(states.map(([, st]) => st.attrs[a])).size > 1 && /^[A-Za-z_][\w.-]*$/.test(a));
				const inner = new Set(states.map(([, st]) => st.inner)).size > 1;
				this.bindings.set(el, { declare, omit: names, extra: names.map((a) => `${a}={${pick(states.map(([, st]) => st.attrs[a]))}}`), ...(inner ? { children: states.map(([state, st]) => `@if (${when(state)}) { <>${emit(st.inner)}</> }`).join('') } : {}) });
			}
			placed++;
		}
		return placed;
	}

	/**
	 * Binds what differs between a control's two states on the descendants that differ: an attribute on the element
	 * that carries it, and an @if arm only where the children themselves differ in shape (a checkbox's check icon).
	 */
	private diff(parent: Element, onHtml: string, offHtml: string, on: string, declare: readonly string[], emit: (html: string) => string): void {
		if (onHtml === offHtml) return;
		const meaningful = (nodes: readonly Node[]) => nodes.filter((n) => !(isText(n) && !n.value.trim()));
		const a = meaningful(childrenOf(parseFragment(onHtml) as unknown as Element));
		const b = meaningful(childrenOf(parseFragment(offHtml) as unknown as Element));
		const page = meaningful(childrenOf(parent));
		const alike = a.length === b.length && a.length === page.length && a.every((x, i) => {
			const y = b[i]!;
			const z = page[i]!;
			if (isText(x) || isText(y)) return isText(x) && isText(y) && x.value === y.value;
			return isElement(x) && isElement(y) && isElement(z) && x.tagName === y.tagName && y.tagName === z.tagName;
		});
		if (!alike) {
			this.bindings.set(parent, mergeBindings(this.bindings.get(parent), { declare, children: `@if (${on}) { <>${emit(onHtml)}</> } @else { <>${emit(offHtml)}</> }` })!);
			return;
		}
		a.forEach((x, i) => {
			if (!isElement(x)) return;
			const y = b[i] as Element;
			const z = page[i] as Element;
			const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
			const names = [...new Set([...x.attrs, ...y.attrs].map((t) => t.name))].filter((n) => attr(x, n) !== attr(y, n) && /^[A-Za-z_][\w.-]*$/.test(n) && n !== 'checked');
			if (names.length) this.bindings.set(z, mergeBindings(this.bindings.get(z), { declare, omit: names, extra: names.map((n) => `${n}={${on} ? ${value(attr(x, n))} : ${value(attr(y, n))}}`) })!);
			this.diff(z, innerOf(x), innerOf(y), on, declare, emit);
		});
	}
}

/**
 * Base UI Tabs on Markless state: the chosen tab's index and the direction of the last change (Base UI's
 * data-activation-direction) in two state()s per tab list. Triggers bind aria-selected, tabindex, data-active and
 * aria-controls; Base UI renders only the chosen panel, so the panel element binds the chosen panel's id, label and
 * index and renders the content each tab showed on the old page (captured by choosing it) in an @if arm.
 */
// Each tab's panel content in an arm; content Markless cannot rebuild in an arm (a shared component) stays rendered, hidden while its tab is not chosen.
function panelArms(name: string, contents: readonly (string | undefined)[], inner: string): string {
	if (/@(if|switch|for) \(|\bvalues\[|<[A-Z]\w*[\s/>]/.test(inner)) return contents.map((c, k) => `<div hidden={${name} !== ${k}}>${c ?? inner}</div>`).join('');
	return contents.map((c, k) => `@if (${name} === ${k}) { <>${c ?? inner}</> }`).join('');
}

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
			let tabs = list.parentNode as Element | null;
			if (active < 0 || !tabs || !('tagName' in tabs)) continue;
			const activeId = attr(triggers[active]!, 'id');
			const panelIn = (el: Element) => [...walk(el)].find((p) => attr(p, 'role') === 'tabpanel' && attr(p, 'aria-labelledby') === activeId);
			// The list may sit in a header beside other controls: the Tabs root is the nearest ancestor holding its panel.
			for (let up: Element | null = tabs; up && 'tagName' in up && up !== root; up = up.parentNode as Element | null) {
				if (panelIn(up)) {
					tabs = up;
					break;
				}
				if (attr(up, 'data-slot') === 'tabs') break;
			}
			// A list without panels (shadcn's line, vertical and icon variants) still switches its triggers.
			const panel = panelIn(tabs);
			const own = panel && { attrs: Object.fromEntries(panel.attrs.map((a) => [a.name, a.value])), inner: '' };
			const panels = panel ? triggers.map((t, k) => (k === active ? own : revealed(t))) : [];
			if (panels.some((p) => !p)) continue;
			const contents = panels.map((p, k) => (k === active ? undefined : emit(p!.inner)));
			if (contents.some((c) => c !== undefined && /@(if|switch|for) \(|<[A-Z]\w*[\s/>]/.test(c))) continue;
			const name = `btab${this.n++}`;
			const dir = `${name}d`;
			const vertical = attr(list, 'data-orientation') === 'vertical';
			const pick = (values: readonly (string | undefined)[]) => values.reduceRight<string>((rest, v, k) => (k === values.length - 1 ? (v === undefined ? 'undefined' : lit(v)) : `${name} === ${k} ? ${v === undefined ? 'undefined' : lit(v)} : ${rest}`), '');
			const panelId = (k: number) => panels[k]?.attrs['id'];
			// React Aria's Tabs: the chosen tab carries data-selected and the panel's id; focus selects (automatic activation).
			if (attr(triggers[0]!, 'data-rac') !== undefined) {
				const declare = [`let ${name} = state(${active});`];
				triggers.forEach((t, k) => {
					const sel = `${name} === ${k}`;
					this.bindings.set(t, {
						declare,
						omit: ['aria-selected', 'tabindex', 'data-selected', 'aria-controls', 'data-hovered', 'data-pressed', 'data-focused', 'data-focus-visible'],
						extra: [`aria-selected={${sel} ? "true" : "false"}`, `tabindex={${sel} ? "0" : "-1"}`, `data-selected={${sel} ? "true" : undefined}`, `aria-controls={${sel} ? ${lit(panelId(k) ?? '')} : undefined}`, `onClick={() => { ${name} = ${k}; }}`, `onFocusIn={() => { ${name} = ${k}; }}`, `onKeyDown={(event) => roving(event)}`],
					});
				});
				const varying = [...new Set(panels.flatMap((p) => Object.keys(p!.attrs)))].filter((a) => new Set(panels.map((p) => p!.attrs[a])).size > 1);
				if (panel) this.bindings.set(panel, { declare, omit: varying, extra: varying.map((a) => `${a}={${pick(panels.map((p) => p!.attrs[a]))}}`), wrap: (inner) => panelArms(name, contents, inner) });
				groups++;
				continue;
			}
			const declare = [`let ${name} = state(${active});`, `let ${dir} = state(${lit(attr(list, 'data-activation-direction') ?? 'none')});`];
			const direction = `data-activation-direction={${dir}}`;
			for (const el of [tabs, list]) if (attr(el, 'data-activation-direction') !== undefined) this.bindings.set(el, { declare, omit: ['data-activation-direction'], extra: [direction] });
			triggers.forEach((t, k) => {
				const choose = `${dir} = ${k} > ${name} ? ${lit(vertical ? 'down' : 'right')} : ${k} < ${name} ? ${lit(vertical ? 'up' : 'left')} : ${dir}; ${name} = ${k};`;
				this.bindings.set(t, {
					declare,
					omit: ['aria-selected', 'tabindex', 'data-active', 'data-composite-item-active', ...(panel ? ['aria-controls'] : []), 'data-activation-direction'],
					extra: [
						`aria-selected={${name} === ${k} ? "true" : "false"}`,
						`tabindex={${name} === ${k} ? "0" : "-1"}`,
						`data-active={${name} === ${k} ? "" : undefined}`,
						`data-composite-item-active={${name} === ${k} ? "" : undefined}`,
						...(panel ? [`aria-controls={${name} === ${k} ? ${lit(panelId(k) ?? '')} : undefined}`] : []),
						direction,
						`onClick={() => { ${choose} }}`,
						`onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ${choose} } else roving(event); }}`,
					],
				});
			});
			if (!panel) {
				groups++;
				continue;
			}
			const varying = [...new Set(panels.flatMap((p) => Object.keys(p!.attrs)))].filter((a) => a !== 'data-activation-direction' && new Set(panels.map((p) => p!.attrs[a])).size > 1);
			this.bindings.set(panel, {
				declare,
				omit: [...varying, 'data-activation-direction'],
				extra: [...varying.map((a) => `${a}={${pick(panels.map((p) => p!.attrs[a]))}}`), direction],
				wrap: (inner) => panelArms(name, contents, inner),
			});
			groups++;
		}
		return groups;
	}
}

/**
 * Disclosures that mount their content where it opens (Base UI Collapsible and Accordion, a Radix Collapsible whose
 * content leaves while closed) on Markless state: one state() per trigger, or per accordion where one item opens at a
 * time, and another for the panel closing while its exit runs; the trigger binds aria-expanded (and data-state, Base UI's
 * data-panel-open), the item and header data-open, and the content the old page mounted on opening is an @if arm at
 * the place it went, rendered while open or closing; panel-motion.ts measures it and ends its exit.
 */
export class InsertedDisclosurePlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/**
	 * `roots`: the pages, where a Base UI disclosure open on load (its content in the page, named by aria-controls)
	 * closes and opens again on the same state.
	 */
	add(items: readonly { readonly trigger: Element; readonly parent: Element; readonly before: Element | null; readonly markup: string; readonly nodes?: readonly Element[]; readonly panelId?: string; readonly panelDepth?: number }[], roots: readonly Element[] = [], multiple: (accordion: Element) => boolean = () => false): number {
		const byTrigger = new Map<Element, (typeof items)[number][]>();
		for (const i of items) (byTrigger.get(i.trigger) ?? byTrigger.set(i.trigger, []).get(i.trigger)!).push(i);
		const isBase = (t: Element) => /^base-ui-/.test(attr(t, 'id') ?? '') || t.attrs.some((a) => a.name.startsWith('data-base-ui') || a.name === 'data-panel-open');
		const openPanels = new Map<Element, Element>();
		for (const root of roots) {
			const byId = new Map<string, Element>();
			for (const el of walk(root)) {
				const id = attr(el, 'id');
				if (id) byId.set(id, el);
			}
			for (const t of walk(root)) {
				if (attr(t, 'aria-expanded') !== 'true' || attr(t, 'aria-haspopup') !== undefined || !t.attrs.some((a) => a.name === 'data-panel-open')) continue;
				const panel = byId.get(attr(t, 'aria-controls') ?? '');
				if (panel && !this.bindings.has(t)) openPanels.set(t, panel);
			}
		}
		// A Base UI disclosure's root (Collapsible.Root, Accordion.Item) carries data-open or data-closed, and so does an
		// Accordion.Header between it and the trigger.
		const stated = (n: Element) => n.attrs.some((a) => a.name === 'data-open' || a.name === 'data-closed');
		const rootsOf = (t: Element) => {
			const out: Element[] = [];
			for (let n = t.parentNode as Element | null; n && 'tagName' in n; n = n.parentNode as Element | null) {
				if (!stated(n)) continue;
				out.push(n);
				if (!/^h[1-6]$/.test(n.tagName)) break;
			}
			return out;
		};
		// An accordion that lets several items be open groups nothing: each item is a disclosure of its own.
		const accordionOf = (el: Element) => {
			for (let n = el.parentNode as Element | null; n && 'tagName' in n; n = n.parentNode as Element | null) if (attr(n, 'data-slot') === 'accordion') return multiple(n) ? undefined : n;
			return undefined;
		};
		const groups = new Map<Element, Element[]>();
		for (const trigger of [...byTrigger.keys(), ...[...openPanels.keys()].filter((t) => !accordionOf(t))]) {
			if (this.bindings.has(trigger)) continue;
			const key = accordionOf(trigger) ?? trigger;
			// A group key is the accordion, or the trigger itself for a standalone disclosure.
			(groups.get(key) ?? groups.set(key, []).get(key)!).push(trigger);
		}
		const inserts = new Map<Element, { before: Element | null; markup: string; declare: string[] }[]>();
		for (const [key, closed] of groups) {
			// An accordion's item open on load has its content in the page already (named by aria-controls): it closes
			// when another opens, hidden by its bound attribute.
			const standalone = key === closed[0];
			const openItems = standalone ? [] : [...walk(key)].filter((t) => attr(t, 'aria-expanded') === 'true' && attr(t, 'aria-haspopup') === undefined && accordionOf(t) === key && !this.bindings.has(t));
			const panels = new Map<Element, Element>();
			for (const t of openItems) {
				const id = attr(t, 'aria-controls');
				const panel = id ? [...walk(key)].find((p) => attr(p, 'id') === id) : undefined;
				if (panel) panels.set(t, panel);
			}
			if (standalone && openPanels.has(key)) panels.set(key, openPanels.get(key)!);
			const triggers = [...closed.filter((t) => !panels.has(t)), ...[...panels.keys()]];
			const name = `ins${this.n++}`;
			const closing = `${name}x`;
			const single = !standalone && triggers.length > 1;
			const initial = triggers.findIndex((t) => panels.has(t));
			const declare = [`let ${name} = state(${single ? initial : String(standalone && panels.has(key))});`, `let ${closing} = state(${single ? -1 : false});`];
			// Base UI names the panel in aria-controls only while it is mounted.
			const panelIds = triggers.map((t) => (panels.has(t) ? attr(t, 'aria-controls') : byTrigger.get(t)?.find((i) => i.panelId)?.panelId) ?? '');
			const ids = `[${panelIds.map(lit).join(', ')}]`;
			// The arm's root closes with the panel when the panel sits inside it (a navigation menu's viewport).
			const depth = triggers.map((t) => (panels.has(t) ? 0 : (byTrigger.get(t)?.find((i) => i.panelId)?.panelDepth ?? 0)));
			const deep = (k: number) => (depth[k] ? `, ${depth[k]}` : '');
			triggers.forEach((trigger, k) => {
				const open = single ? `${name} === ${k}` : name;
				// A closing panel stays rendered until its exit motion ends (panel-motion.ts), as Base UI keeps it mounted.
				const shown = single ? `(${name} === ${k} || ${closing} === ${k})` : `(${name} || ${closing})`;
				const toggle = single
					? `const was = ${name}; ${name} = ${name} === ${k} ? -1 : ${k}; if (was >= 0 && was !== ${name}) { ${closing} = was; panelExit(${ids}[was] ?? '', () => { if (${closing} === was) ${closing} = -1; }${depth.some(Boolean) ? `, [${depth.join(', ')}][was]` : ''}); } if (${name} === ${k}) panelEnter(${lit(panelIds[k]!)}${deep(k)});`
					: `${name} = !${name}; if (${name}) panelEnter(${lit(panelIds[k]!)}${deep(k)}); else { ${closing} = true; panelExit(${lit(panelIds[k]!)}, () => { ${closing} = false; }${deep(k)}); }`;
				const base = isBase(trigger);
				const extra = [`aria-expanded={${open} ? "true" : "false"}`, `onClick={() => { ${toggle} }}`];
				const omit = ['aria-expanded'];
				if (attr(trigger, 'data-state') !== undefined) {
					extra.push(`data-state={${open} ? "open" : "closed"}`);
					omit.push('data-state');
					// A Radix Collapsible's root around its trigger writes the same data-state.
					if (!base)
						for (let n = trigger.parentNode as Element | null; n && 'tagName' in n; n = n.parentNode as Element | null)
							if (attr(n, 'data-state') !== undefined) {
								if (attr(n, 'data-state') === attr(trigger, 'data-state') && !this.bindings.has(n)) this.bindings.set(n, { declare, omit: ['data-state'], extra: [`data-state={${open} ? "open" : "closed"}`] });
								break;
							}
				}
				if (base) {
					extra.push(`data-panel-open={${open} ? "" : undefined}`);
					omit.push('data-panel-open');
					if (panelIds[k]) {
						extra.push(`aria-controls={${open} ? ${lit(panelIds[k]!)} : undefined}`);
						omit.push('aria-controls');
					}
					for (const root of rootsOf(trigger)) if (!this.bindings.has(root)) this.bindings.set(root, { declare, omit: ['data-open', 'data-closed'], extra: [`data-open={${open} ? "" : undefined}`, `data-closed={${open} ? undefined : ""}`] });
				}
				this.bindings.set(trigger, { declare, omit, extra });
				const panel = panels.get(trigger);
				if (panel) this.bindings.set(panel, { declare, omit: ['hidden', 'data-open', 'data-closed'], extra: [`hidden={!${shown}}`, `data-open={${open} ? "" : undefined}`, `data-closed={${open} ? undefined : ""}`] });
				for (const i of byTrigger.get(trigger) ?? []) {
					// Content placed in the page (it holds disclosures of its own) shows while open, its own disclosures bound inside.
					if (i.nodes) {
						for (const node of i.nodes) if (!this.bindings.has(node)) this.bindings.set(node, { declare, omit: ['hidden'], extra: [`hidden={!${shown}}`] });
						continue;
					}
					const list = inserts.get(i.parent) ?? inserts.set(i.parent, []).get(i.parent)!;
					const markup = /@(if|switch|for) \(|<[A-Z]\w*[\s/>]/.test(i.markup) ? '' : `@if ${shown} { <>${i.markup}</> }`;
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

/**
 * Controls the site lists as switching attributes in place (a sidebar's trigger and rail) on Markless state, from
 * what one use changed on the old page (toggles.ts `captureSwitches`): controls that change the same attributes share
 * one state(), each changed attribute binds to it, and each use writes the cookies the old page wrote for that state.
 */
export class SwitchPlan {
	private readonly bindings = new Map<Element, Binding>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	add(switches: readonly Switch[], locate: (sig: string, nth: number) => Element | undefined): number {
		const groups = new Map<string, Switch[]>();
		for (const s of switches) {
			const key = s.changes.map((c) => `${c.sig}#${c.nth}:${c.attr}`).sort().join('|');
			(groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
		}
		let placed = 0;
		for (const members of groups.values()) {
			const first = members[0]!;
			const targets = first.changes.map((c) => ({ c, el: locate(c.sig, c.nth) }));
			const controls = members.map((m) => locate(m.sig, m.nth));
			if (targets.some((t) => !t.el) || controls.some((c) => !c || this.bindings.has(c))) continue;
			const name = `sw${this.n++}`;
			const declare = [`let ${name} = state(false);`];
			const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
			const byEl = new Map<Element, typeof first.changes>();
			for (const t of targets) byEl.set(t.el!, [...(byEl.get(t.el!) ?? []), t.c]);
			for (const [el, changes] of byEl) {
				const own = this.bindings.get(el);
				this.bindings.set(el, { declare, omit: [...(own?.omit ?? []), ...changes.map((c) => c.attr)], extra: [...(own?.extra ?? []), ...changes.map((c) => `${c.attr}={${name} ? ${value(c.after)} : ${value(c.before)}}`)] });
			}
			const cookies = (list: Switch['cookiesOn']) => JSON.stringify(list);
			controls.forEach((control) => {
				const own = this.bindings.get(control!);
				this.bindings.set(control!, { declare, omit: own?.omit ?? [], extra: [...(own?.extra ?? []), `onClick={() => { ${name} = !${name}; writeCookies(${name} ? ${cookies(first.cookiesOn)} : ${cookies(first.cookiesOff)}); }}`] });
			});
			placed++;
		}
		return placed;
	}

	/**
	 * Binds what differs between a control's two states on the descendants that differ: an attribute on the element
	 * that carries it, and an @if arm only where the children themselves differ in shape (a checkbox's check icon).
	 */
	private diff(parent: Element, onHtml: string, offHtml: string, on: string, declare: readonly string[], emit: (html: string) => string): void {
		if (onHtml === offHtml) return;
		const meaningful = (nodes: readonly Node[]) => nodes.filter((n) => !(isText(n) && !n.value.trim()));
		const a = meaningful(childrenOf(parseFragment(onHtml) as unknown as Element));
		const b = meaningful(childrenOf(parseFragment(offHtml) as unknown as Element));
		const page = meaningful(childrenOf(parent));
		const alike = a.length === b.length && a.length === page.length && a.every((x, i) => {
			const y = b[i]!;
			const z = page[i]!;
			if (isText(x) || isText(y)) return isText(x) && isText(y) && x.value === y.value;
			return isElement(x) && isElement(y) && isElement(z) && x.tagName === y.tagName && y.tagName === z.tagName;
		});
		if (!alike) {
			this.bindings.set(parent, mergeBindings(this.bindings.get(parent), { declare, children: `@if (${on}) { <>${emit(onHtml)}</> } @else { <>${emit(offHtml)}</> }` })!);
			return;
		}
		a.forEach((x, i) => {
			if (!isElement(x)) return;
			const y = b[i] as Element;
			const z = page[i] as Element;
			const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
			const names = [...new Set([...x.attrs, ...y.attrs].map((t) => t.name))].filter((n) => attr(x, n) !== attr(y, n) && /^[A-Za-z_][\w.-]*$/.test(n) && n !== 'checked');
			if (names.length) this.bindings.set(z, mergeBindings(this.bindings.get(z), { declare, omit: names, extra: names.map((n) => `${n}={${on} ? ${value(attr(x, n))} : ${value(attr(y, n))}}`) })!);
			this.diff(z, innerOf(x), innerOf(y), on, declare, emit);
		});
	}
}

/**
 * Notifications a site-listed control shows (a toast) on Markless state: the markup the old page added inside the live
 * region is an @if arm at the region's end, shown by the control's use for as long as the old page kept it.
 */
export class NotifyPlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly names = new Map<Element, string>();
	private readonly regions = new Set<Element>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** The state a control sets: part of its identity, so no shared component holds it for two pages. */
	nameOf(el: Element): string | undefined {
		return this.names.get(el);
	}

	/** Whether the element is a live region the page shows notifications in. */
	hosts(el: Element): boolean {
		return this.regions.has(el);
	}

	/** Whether a sonner toast was placed: parts/sonner.ts runs it. */
	sonner = false;
	private readonly toasterRegions = new Set<Element>();

	/** Whether the element is (not merely holds) a region a sonner Toaster renders its toasts in. */
	rendersToasts(el: Element): boolean {
		return this.toasterRegions.has(el);
	}


	add(notifications: readonly Notify[], locate: (sig: string, nth: number) => Element | undefined, emit: (html: string, bind?: (el: Element) => Binding | undefined) => string): number {
		let placed = 0;
		const toasters = new Map<Element, { control: Element; toast: SonnerToast; note: Notify; template?: { name: string; copied: string; controls: Element[] } }[]>();
		for (const note of notifications) {
			const control = locate(note.sig, note.nth);
			const region = locate(note.into.sig, note.into.nth);
			if (!control || !region || this.bindings.has(control)) continue;
			if (note.sonner) {
				const template = note.template && { name: note.template.name, copied: note.template.copied, controls: note.template.controls.map((c) => locate(c.sig, c.nth)).filter((el): el is Element => el !== undefined && !this.bindings.has(el)) };
				(toasters.get(region) ?? toasters.set(region, []).get(region)!).push({ control, toast: note.sonner, note, ...(template ? { template } : {}) });
				placed += template ? template.controls.length : 1;
				continue;
			}
			const markup = emit(note.html);
			if (/@(if|switch|for) \(|<[A-Z]\w*[\s/>]/.test(markup)) continue;
			const name = `nt${this.n++}`;
			const declare = [`let ${name} = state(false);`];
			this.names.set(control, name);
			this.regions.add(region);
			this.bindings.set(control, { declare, extra: [`onClick={() => { ${name} = true; setTimeout(() => { ${name} = false; }, ${Math.max(0, note.ms - 600)}); }}`] });
			const own = this.bindings.get(region);
			this.bindings.set(region, { declare: [...(own?.declare ?? []), ...declare], inserts: [...(own?.inserts ?? []), { before: null, markup: `@if (${name}) { <>${markup}</> }` }] });
			placed++;
		}
		for (const [region, toasts] of toasters) this.sonnerToaster(region, toasts, emit);
		return placed;
	}

	/**
	 * A sonner Toaster on Markless state (parts/sonner.ts): its section renders a list per position in use and a toast per
	 * entry of one state(), each toast showing the markup its control's use showed then, in an arm per toast and phase.
	 */
	private sonnerToaster(region: Element, all: readonly { control: Element; toast: SonnerToast; note: Notify; template?: { name: string; copied: string; controls: Element[] } }[], emit: (html: string, bind?: (el: Element) => Binding | undefined) => string): void {
		// Only elements can be hidden while another phase shows: a toast showing bare text is left unported.
		const toasts = all.filter(({ toast }) => toast.phases.every((p) => !childrenOf(parseFragment(p.inner) as unknown as Element).some((n) => isText(n) && n.value.trim())));
		if (!toasts.length) return;
		const name = `tst${this.n++}`;
		const first = toasts[0]!.toast.toaster;
		const declare = [`let ${name} = state(SONNER_EMPTY);`];
		const commit = `(v) => (${name} = v)`;
		const style = (attrs: readonly (readonly [string, string])[]) => attrs.find(([n]) => n === 'style')?.[1] ?? '';
		// The declarations sonner's Toaster and Toast write first in a style, which parts/sonner.ts writes itself.
		const rest = (css: string, own: readonly string[]) => css.split(';').map((d) => d.trim()).filter((d) => d && !own.includes(d.split(':')[0]!.trim())).map((d) => `${d};`).join(' ');
		const props = { id: name, position: first.position, gap: first.gap, visibleToasts: first.visibleToasts, expand: first.expand, hotkey: first.hotkey, style: rest(style(first.ol), ['--front-toast-height']) };
		const T = JSON.stringify(props);
		// Every toast's attributes in the order sonner writes them: one a toast lacks goes after the one before it in another.
		const names: string[] = [];
		for (const { toast } of toasts)
			for (const phase of toast.phases)
				phase.attrs.forEach(([n], k) => {
					if (n === 'style' || names.includes(n)) return;
					const before = phase.attrs.slice(0, k).map(([m]) => m).reverse().find((m) => names.includes(m));
					names.splice(before === undefined ? 0 : names.indexOf(before) + 1, 0, n);
				});
		for (const n of SONNER_STATE) if (!names.includes(n)) names.push(n);
		const arms: string[] = [];
		// A template's toast names what its control copied: written there from the toast's own text (item.text).
		const HOLE = '\uE000';
		const escaped = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		toasts.forEach(({ control, toast, note, template }, k) => {
			const spec = { view: k, ...(toast.position ? { position: toast.position } : {}), duration: toast.duration, dismissible: toast.dismissible, promise: toast.promise, style: rest(style(toast.phases[0]!.attrs), ['--index', '--toasts-before', '--z-index', '--offset', '--initial-height']), phases: toast.phases.map((p) => ({ at: p.at, ...(p.type !== undefined ? { type: p.type } : {}), attrs: Object.fromEntries(p.attrs.filter(([n]) => n !== 'style' && !SONNER_STATE.has(n))) })) };
			toast.phases.forEach((p, i) => {
				// What each toast shows is all in its row, but for its view hidden: Markless rebuilds a row holding an arm
				// whenever the rows move (a new toast goes first), and a rebuilt toast loses its transitions.
				const view = lit(`${k}.${i}`);
				const inner = template ? p.inner.split(escaped(template.copied)).join(HOLE) : p.inner;
				// Text the use gives the toast (a submitted form's values) is the item's own, in place of what the capture showed.
				const slots = Object.entries(note.texts ?? {});
				const arm = slots.reduce((markup, [slot, text]) => markup.replaceAll(`{${lit(text)}}`, `{item.t[${lit(slot)}] ?? ""}`), emit(inner, (el) => (el.parentNode && !('tagName' in el.parentNode) ? { omit: ['style'], extra: [`style={item.view === ${view} ? ${attr(el, 'style') === undefined ? 'undefined' : lit(attr(el, 'style')!)} : "display: none"}`] } : undefined)));
				arms.push(template ? arm.split(HOLE).join('{item.text}') : arm);
			});
			for (const each of template ? template.controls : [control]) {
				this.names.set(each, `${name}:${k}`);
				// A form's toast shows when it is submitted and passes, with the values it passed (the form-library part's mmformsubmit).
				const add = template
					? `onClick={(event) => sonnerAdd(${T}, { ...${JSON.stringify(spec)}, text: ${template.name}(event.target as Element) }, ${commit})}`
					: note.onSubmit
						? `onMmformsubmit={(event) => sonnerAdd(${T}, ${JSON.stringify(spec)}, ${commit}, { v: JSON.stringify((event as CustomEvent).detail, null, 2) })}`
						: `onClick={() => sonnerAdd(${T}, ${JSON.stringify(spec)}, ${commit})}`;
				this.bindings.set(each, mergeBindings(this.bindings.get(each), { declare, extra: [add] })!);
			}
		});
		const on = (events: readonly string[], call: string) => events.map((e) => `on${e}={(event) => ${call}}`);
		const li = names.map((n) => `${n}={item.a[${lit(n)}]}`);
		const ol = first.ol.map(([n, v]) => (n === 'data-y-position' ? `${n}={list.y}` : n === 'data-x-position' ? `${n}={list.x}` : n === 'style' ? 'style={list.style}' : `${n}=${lit(v)}`));
		// A list's handlers take its toasts' events too (parts/sonner.ts finds the toast they happened in).
		const markup = `@for (const list of ${name}.lists; key list.position) { <ol ${ol.join(' ')} ${on(['MouseEnter', 'MouseMove', 'MouseLeave', 'DragEnd', 'PointerDown', 'PointerUp', 'PointerMove', 'Click', 'FocusIn', 'FocusOut'], `sonnerList(${T}, list.position, event, ${commit})`).join(' ')}>@for (const item of list.items; key item.id) { <li ${li.join(' ')} style={item.a.style}>${arms.join('')}</li> }</ol> }`;
		this.regions.add(region);
		this.toasterRegions.add(region);
		const own = this.bindings.get(region);
		this.bindings.set(region, { ...own, declare: [...(own?.declare ?? []), ...declare], extra: [...(own?.extra ?? []), `data-mm-toaster=${lit(name)}`], children: markup });
		this.sonner = true;
	}

	/**
	 * Binds what differs between a control's two states on the descendants that differ: an attribute on the element
	 * that carries it, and an @if arm only where the children themselves differ in shape (a checkbox's check icon).
	 */
	private diff(parent: Element, onHtml: string, offHtml: string, on: string, declare: readonly string[], emit: (html: string) => string): void {
		if (onHtml === offHtml) return;
		const meaningful = (nodes: readonly Node[]) => nodes.filter((n) => !(isText(n) && !n.value.trim()));
		const a = meaningful(childrenOf(parseFragment(onHtml) as unknown as Element));
		const b = meaningful(childrenOf(parseFragment(offHtml) as unknown as Element));
		const page = meaningful(childrenOf(parent));
		const alike = a.length === b.length && a.length === page.length && a.every((x, i) => {
			const y = b[i]!;
			const z = page[i]!;
			if (isText(x) || isText(y)) return isText(x) && isText(y) && x.value === y.value;
			return isElement(x) && isElement(y) && isElement(z) && x.tagName === y.tagName && y.tagName === z.tagName;
		});
		if (!alike) {
			this.bindings.set(parent, mergeBindings(this.bindings.get(parent), { declare, children: `@if (${on}) { <>${emit(onHtml)}</> } @else { <>${emit(offHtml)}</> }` })!);
			return;
		}
		a.forEach((x, i) => {
			if (!isElement(x)) return;
			const y = b[i] as Element;
			const z = page[i] as Element;
			const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
			const names = [...new Set([...x.attrs, ...y.attrs].map((t) => t.name))].filter((n) => attr(x, n) !== attr(y, n) && /^[A-Za-z_][\w.-]*$/.test(n) && n !== 'checked');
			if (names.length) this.bindings.set(z, mergeBindings(this.bindings.get(z), { declare, omit: names, extra: names.map((n) => `${n}={${on} ? ${value(attr(x, n))} : ${value(attr(y, n))}}`) })!);
			this.diff(z, innerOf(x), innerOf(y), on, declare, emit);
		});
	}
}

/**
 * React Aria's Table with checkbox selection (selectionMode multiple, useTableSelectionCheckbox): which rows are chosen
 * is one state() per table; each row binds aria-selected and data-selected (its cells data-selected), its checkbox's
 * label data-selected and the indicator each toggle capture showed when checked, and the select-all checkbox
 * data-selected when every row is chosen and data-indeterminate when only some are. A press on a row or its checkbox
 * toggles it (selectionBehavior "toggle"), the select-all checkbox chooses every row or none, Space toggles the
 * focused row.
 */
export class RacTablePlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly claimed = new Set<Element>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** The checkboxes this plan binds, which the checkable plan leaves alone. */
	claims(el: Element): boolean {
		return this.claimed.has(el);
	}

	add(root: Element, groups: readonly ToggleGroup[], locate: (sig: string, nth: number) => Element | undefined, emit: (html: string) => string, skip: (table: Element) => boolean = () => false): number {
		const captured = new Map<Element, ToggleGroup['controls'][number]>();
		for (const g of groups) for (const c of g.controls) {
			const el = locate(c.sig, c.nth);
			if (el) captured.set(el, c);
		}
		let placed = 0;
		for (const table of walk(root)) {
			if (table.tagName !== 'table' || attr(table, 'role') !== 'grid' || attr(table, 'aria-multiselectable') !== 'true' || attr(table, 'data-rac') === undefined || skip(table)) continue;
			const selection = (scope: Element) => [...walk(scope)].find((e) => e.tagName === 'label' && attr(e, 'slot') === 'selection');
			const thead = [...walk(table)].find((e) => e.tagName === 'thead');
			const tbody = [...walk(table)].find((e) => e.tagName === 'tbody');
			const all = thead && selection(thead);
			const rows = tbody ? [...walk(tbody)].filter((e) => e.tagName === 'tr' && attr(e, 'role') === 'row') : [];
			const boxes = rows.map((r) => selection(r));
			if (!rows.length || boxes.some((b) => !b)) continue;
			const states = boxes.map((b) => captured.get(b!));
			if (states.some((s) => !s)) continue;
			const name = `tbl${this.n++}`;
			const initial = rows.map((r) => attr(r, 'aria-selected') === 'true');
			const declare = [`let ${name} = state(${JSON.stringify(initial)});`];
			const t = (expr: string) => `{${expr} ? "true" : undefined}`;
			const toggle = (i: number) => `${name} = ${name}.map((on, k) => (k === ${i} ? !on : on));`;
			rows.forEach((row, i) => {
				const on = `${name}[${i}]`;
				// A press on the row or its checkbox; the checkbox input's own click (the label forwards it) is the one counted.
				this.bindings.set(row, { declare, omit: ['aria-selected', 'data-selected'], extra: [`aria-selected={${on} ? "true" : "false"}`, `data-selected=${t(on)}`, `onClick={(event) => { const at = event.target as Element; if (at.closest('label') && at.tagName !== 'INPUT') return; ${toggle(i)} }}`, `onKeyDown={(event) => { if (event.key === ' ') { event.preventDefault(); ${toggle(i)} } }}`] });
				for (const cell of [...walk(row)].filter((e) => e !== row && (attr(e, 'role') === 'gridcell' || attr(e, 'role') === 'rowheader'))) this.bindings.set(cell, { declare, omit: ['data-selected'], extra: [`data-selected=${t(on)}`] });
				const box = boxes[i]!;
				const c = states[i]!;
				this.claimed.add(box);
				this.bindings.set(box, { declare, omit: ['data-selected'], extra: [`data-selected=${t(on)}`] });
				const indicator = [...walk(box)].find((e) => /-indicator$/.test(attr(e, 'data-slot') ?? ''));
				const iconOf = (inner: string) => /data-slot="[^"]*-indicator"[^>]*>(.*?)<\/span>/s.exec(inner)?.[1] ?? '';
				if (indicator) this.bindings.set(indicator, { declare, children: `@if (${on}) { <>${emit(iconOf(c.on.inner))}</> }` });
				const input = [...walk(box)].find((e) => e.tagName === 'input');
				if (input) this.bindings.set(input, { declare, omit: ['checked'], extra: [`checked={${on}}`] });
			});
			if (all) {
				const c = captured.get(all) ?? states[0]!;
				this.claimed.add(all);
				const every = `${name}.every(Boolean)`;
				const some = `${name}.some(Boolean)`;
				this.bindings.set(all, { declare, omit: ['data-selected', 'data-indeterminate'], extra: [`data-selected=${t(every)}`, `data-indeterminate=${t(`${some} && !${every}`)}`, `onClick={(event) => { if ((event.target as Element).tagName !== 'INPUT') return; const to = !${every}; ${name} = ${name}.map(() => to); }}`] });
				const indicator = [...walk(all)].find((e) => /-indicator$/.test(attr(e, 'data-slot') ?? ''));
				const iconOf = (inner: string) => /data-slot="[^"]*-indicator"[^>]*>(.*?)<\/span>/s.exec(inner)?.[1] ?? '';
				if (indicator) this.bindings.set(indicator, { declare, children: `@if (${some}) { <>${emit(iconOf(c.on.inner))}</> }` });
				const input = [...walk(all)].find((e) => e.tagName === 'input');
				if (input) this.bindings.set(input, { declare, omit: ['checked'], extra: [`checked={${every}}`] });
			}
			placed++;
		}
		return placed;
	}
}
