import type { Mark, Marked } from './marks.ts';

/** A prop a port reads off one rendered instance, as the old page's React tree gave it. */
export interface InstanceProp {
	readonly name: string;
	/** The attribute written, `data-mm-<name in kebab case>` unless given. */
	readonly attr?: string;
	/** `form-value`: the string a form submits for the value, as Base UI serializes it (stringifyAsValue). */
	readonly as?: 'form-value';
	/** Written when the instance was given none: the library's default. */
	readonly fallback?: string;
}

/** The props a port needs on the elements of one kind it handles, each read from that element's own instance. */
export interface InstanceSpec {
	/** The port under `parts/` that reads them. */
	readonly port: string;
	readonly selector: string;
	readonly props: readonly InstanceProp[];
	/** Text every captured document holding such an element contains: a capture without it never needs taking again. */
	readonly hints: readonly string[];
	/** Bumped when the spec reads more: captures holding its hints are taken again, others are kept (1 when absent). */
	readonly version?: number;
}

export const INSTANCE_PROPS: readonly InstanceSpec[] = [
	{ port: 'base-ui/combobox', selector: 'input[role="combobox"][aria-haspopup="listbox"]:not([cmdk-input])', props: [{ name: 'autoHighlight' }], hints: ['aria-haspopup="listbox"'] },
	{ port: 'base-ui/combobox', selector: '[role="listbox"][data-base-ui-focusable] [role="option"]', props: [{ name: 'value', attr: 'data-mm-value', as: 'form-value' }], hints: ['data-base-ui-focusable', 'role="option"'] },
	{ port: 'base-ui/dialog', selector: '[data-base-ui-click-trigger][aria-haspopup="dialog"]', props: [{ name: 'disablePointerDismissal' }], hints: ['data-base-ui-click-trigger', 'aria-haspopup="dialog"'] },
	// Its Positioner's offsets as this instance gave them (an input with an icon addon moves its list by alignOffset).
	{ port: 'base-ui/combobox', selector: '[data-slot="combobox-content"]', props: [{ name: 'alignOffset' }, { name: 'sideOffset' }], hints: ['data-slot="combobox-content"'], version: 2 },
	// The side and alignment a popup asked for: its data-side and data-align are where it went, after a flip away from an edge.
	{ port: 'base-ui/popup', selector: '[data-base-ui-portal] > [role="presentation"][data-side]', props: [{ name: 'side', fallback: 'bottom' }, { name: 'align', fallback: 'center' }], hints: ['data-base-ui-portal', 'data-side'] },
	{ port: 'popper', selector: '[data-radix-popper-content-wrapper] > [data-side]', props: [{ name: 'side', fallback: 'bottom' }, { name: 'align', fallback: 'center' }], hints: ['data-radix-popper-content-wrapper'] },
];

/** Each spec as a mark of its own, so a spec that reads more takes again only the captures holding its hints. */
export const instancePropMarks = (specs: readonly InstanceSpec[] = INSTANCE_PROPS): Mark[] => specs.map((s) => ({ id: `instance-props:${s.port}:${s.selector}`, version: s.version ?? 1, applies: (html) => s.hints.every((hint) => html.includes(hint)) }));

/** A capture written before each spec had its own version: `instanceProps: 1` was read as holding every spec. */
export const legacyInstanceProps = (instanceProps: number | undefined, specs: readonly InstanceSpec[] = INSTANCE_PROPS): Marked => (instanceProps === 1 ? Object.fromEntries(specs.map((s) => [`instance-props:${s.port}:${s.selector}`, 1])) : {});

/** Runs in the old page: writes on each element a spec selects the props its own instance was given (`added`: in `__mmAdded` only). */
export function markInstanceProps({ specs, added }: { readonly specs: readonly InstanceSpec[]; readonly added: boolean }): void {
	type Fiber = { tag: number; type: unknown; stateNode: unknown; memoizedProps: unknown; return: Fiber | null; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null };
	const fiberOf = (el: Element) => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		return key ? ((el as unknown as Record<string, Fiber>)[key] ?? undefined) : undefined;
	};
	// The DOM elements a fiber renders at its top: itself if it is one, else its children's.
	const hostsOf = (fiber: Fiber, out: Element[] = []): Element[] => {
		if (fiber.stateNode instanceof Element && typeof fiber.type === 'string') out.push(fiber.stateNode);
		else for (let c = fiber.child; c; c = c.sibling) hostsOf(c, out);
		return out;
	};
	const kebab = (name: string) => `data-mm-${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
	const serialize = (value: unknown) => {
		if (value == null) return '';
		if (typeof value === 'string') return value;
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	};
	const formValue = (value: unknown, toString: unknown) => {
		if (typeof toString === 'function' && value != null) return String(toString(value) ?? '');
		if (value && typeof value === 'object' && 'value' in value && 'label' in value) return serialize((value as { value: unknown }).value);
		return serialize(value);
	};
	// Components only (function, class, forwardRef, memo): a context provider's props carry a `value` of its own.
	const COMPONENT = new Set([0, 1, 11, 14, 15]);
	const own = (fiber: Fiber, name: string) => COMPONENT.has(fiber.tag) && fiber.memoizedProps !== null && typeof fiber.memoizedProps === 'object' && Object.hasOwn(fiber.memoizedProps, name);
	const roots = added ? ((window as unknown as { __mmAdded?: (Element | { node: Element })[] }).__mmAdded ?? []).map((a) => (a instanceof Element ? a : a.node)).filter((n) => n.isConnected) : [document.documentElement];
	for (const spec of specs) {
		const elements = new Set(roots.flatMap((root) => [...(root.matches(spec.selector) ? [root] : []), ...root.querySelectorAll(spec.selector)]));
		for (const el of elements) {
			const start = fiberOf(el);
			if (!start) continue;
			const others = (f: Fiber, from: Fiber) => {
				for (let c = f.child; c; c = c.sibling) if (c !== from && c !== from.alternate && hostsOf(c).some((h) => h.matches(spec.selector) || h.querySelector(spec.selector))) return true;
				return false;
			};
			// Up from the element, the first component given each prop; a level that renders another such element is past this instance.
			const found = new Map<string, unknown>();
			let toString: unknown;
			for (let from = start, f = start.return; f && found.size < spec.props.length; from = f, f = f.return) {
				if (others(f, from)) break;
				for (const p of spec.props) if (!found.has(p.name) && own(f, p.name)) found.set(p.name, (f.memoizedProps as Record<string, unknown>)[p.name]);
			}
			if (spec.props.some((p) => p.as === 'form-value'))
				for (let f = start.return; f; f = f.return)
					if (own(f, 'itemToStringValue')) {
						toString = (f.memoizedProps as Record<string, unknown>).itemToStringValue;
						break;
					}
			for (const p of spec.props) {
				const value = found.get(p.name);
				if (value === undefined && p.fallback !== undefined) el.setAttribute(p.attr ?? kebab(p.name), p.fallback);
				if (value === undefined || (p.as !== 'form-value' && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) continue;
				el.setAttribute(p.attr ?? kebab(p.name), p.as === 'form-value' ? formValue(value, toString) : String(value));
			}
		}
	}
}
