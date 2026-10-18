// react-json-view-lite 2.5.0's tree (the debug pages): a node opens and closes on click and on ArrowRight/ArrowLeft,
// ArrowUp/ArrowDown move between its buttons, and a node opened for the first time renders its children as the
// library does, each starting open or closed as the page's shouldExpandNode decided.
type Style = Record<string, string> & { ariaLables: { collapseJson: string; expandJson: string }; quotesForFieldNames?: boolean; noQuotesForStringValues?: boolean; stringifyStringValues?: boolean };
type Hint = { data: string; expand: boolean[]; style: Style };
type Node = { value: unknown; level: number; field: string | undefined; expanded: boolean; index: number };

const bound = new WeakSet<Element>();
let ids = 0;

const isObject = (value: unknown): value is Record<string, unknown> | unknown[] => typeof value === 'object' && value !== null && !('$undefined' in value) && !('$function' in value) && !('$date' in value);
const entriesOf = (value: Record<string, unknown> | unknown[]): [string | undefined, unknown][] => (Array.isArray(value) ? value.map((v) => [undefined, v]) : Object.entries(value));
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const quoteString = (value: string, quoted?: boolean) => (!value || quoted ? `"${value}"` : value);

export function initJsonViews(hint: (el: Element, name: string) => string | undefined): void {
	for (const tree of document.querySelectorAll('[role=tree]')) {
		const raw = hint(tree, 'json-view');
		if (!raw || bound.has(tree)) continue;
		bound.add(tree);
		const { data: json, expand, style } = JSON.parse(raw) as Hint;
		const data: unknown = JSON.parse(json);
		const order = new Map<unknown, number>();
		const number = (value: unknown) => {
			if (!isObject(value)) return;
			order.set(value, order.size);
			for (const [, child] of entriesOf(value)) number(child);
		};
		number(data);
		const nodes = new WeakMap<Element, Node>();

		const label = (field: string | undefined) => (field || field === '' ? `<span class="${style.label}">${escape(quoteString(field, style.quotesForFieldNames))}:</span>` : '');
		const comma = (last: boolean) => (last ? '' : `<span class="${style.punctuation}">,</span>`);
		const primitive = (value: unknown, field: string | undefined, last: boolean): string => {
			let text: string;
			let cls = style.otherValue;
			if (value === null) [text, cls] = ['null', style.nullValue!];
			else if (typeof value === 'object' && '$undefined' in value) [text, cls] = ['undefined', style.undefinedValue!];
			else if (typeof value === 'object' && '$function' in value) text = 'function() { }';
			else if (typeof value === 'object' && '$date' in value) text = String((value as { $date: string }).$date);
			else if (typeof value === 'string') [text, cls] = [style.stringifyStringValues ? JSON.stringify(value) : !style.noQuotesForStringValues ? `"${value}"` : value, style.stringValue!];
			else if (typeof value === 'boolean') [text, cls] = [value ? 'true' : 'false', style.booleanValue!];
			else if (typeof value === 'number') [text, cls] = [String(value), style.numberValue!];
			else text = String(value);
			return `<div class="${style.basicChildStyle}" role="treeitem">${label(field)}<span class="${cls}">${escape(text)}</span>${comma(last)}</div>`;
		};
		const render = (value: unknown, level: number, field: string | undefined, last: boolean): string => {
			if (!isObject(value)) return primitive(value, field, last);
			const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
			const entries = entriesOf(value);
			if (entries.length === 0) return `<div class="${style.basicChildStyle}" role="treeitem">${label(field)}<span class="${style.punctuation}">${open}</span><span class="${style.punctuation}">${close}</span>${comma(last)}</div>`;
			const expanded = expand[order.get(value)!] ?? false;
			const id = expanded ? `mm-json-${++ids}` : '';
			const children = expanded ? `<ul id="${id}" role="group" class="${style.childFieldsContainer}">${entries.map(([k, v], i) => render(v, level + 1, k, i === entries.length - 1)).join('')}</ul>` : `<span class="${style.collapsedContent}"></span>`;
			return `<div class="${style.basicChildStyle}" role="treeitem" aria-expanded="${expanded}"><span class="${expanded ? style.collapseIcon : style.expandIcon}" role="button" aria-label="${expanded ? style.ariaLables.collapseJson : style.ariaLables.expandJson}" aria-expanded="${expanded}"${expanded ? ` aria-controls="${id}"` : ''} tabindex="${level === 0 ? 0 : -1}"></span>${label(field)}<span class="${style.punctuation}">${open}</span>${children}<span class="${style.punctuation}">${close}</span>${comma(last)}</div>`;
		};
		// The server rendered the tree; each of its nodes is matched to its value once.
		const bind = (item: Element, value: unknown, level: number, field: string | undefined) => {
			if (!isObject(value)) return;
			const entries = entriesOf(value);
			if (entries.length === 0) return;
			const expanded = item.getAttribute('aria-expanded') === 'true';
			nodes.set(item, { value, level, field, expanded, index: order.get(value)! });
			const list = item.querySelector(':scope > ul[role=group]');
			if (expanded && list) [...list.children].forEach((child, i) => bind(child, entries[i]![1], level + 1, entries[i]![0]));
		};
		const root = tree.firstElementChild;
		if (root) bind(root, data, 0, undefined);

		const setExpanded = (item: Element, node: Node, expanded: boolean) => {
			if (node.expanded === expanded) return;
			node.expanded = expanded;
			const button = item.querySelector(':scope > [role=button]')!;
			const entries = entriesOf(node.value as Record<string, unknown>);
			item.setAttribute('aria-expanded', String(expanded));
			button.className = expanded ? style.collapseIcon! : style.expandIcon!;
			button.setAttribute('aria-label', expanded ? style.ariaLables.collapseJson : style.ariaLables.expandJson);
			button.setAttribute('aria-expanded', String(expanded));
			const slot = item.querySelector(`:scope > ul[role=group], :scope > span.${CSS.escape(style.collapsedContent!.split(' ')[0]!)}`);
			if (expanded) {
				const id = `mm-json-${++ids}`;
				button.setAttribute('aria-controls', id);
				const ul = document.createElement('ul');
				ul.id = id;
				ul.setAttribute('role', 'group');
				ul.className = style.childFieldsContainer!;
				ul.innerHTML = entries.map(([k, v], i) => render(v, node.level + 1, k, i === entries.length - 1)).join('');
				slot?.replaceWith(ul);
				[...ul.children].forEach((child, i) => bind(child, entries[i]![1], node.level + 1, entries[i]![0]));
			} else {
				button.removeAttribute('aria-controls');
				const span = document.createElement('span');
				span.className = style.collapsedContent!;
				slot?.replaceWith(span);
			}
		};
		const itemOf = (target: EventTarget | null) => {
			const el = target instanceof Element ? target : null;
			const item = el?.closest('[role=treeitem]');
			return item && tree.contains(item) && nodes.has(item) && (el!.matches('[role=button]') || el!.parentElement === item) ? item : null;
		};
		tree.addEventListener('click', (event) => {
			const target = event.target as Element;
			const item = itemOf(target);
			if (!item || !(target.matches('[role=button]') || target.matches(`.${CSS.escape(style.collapsedContent!.split(' ')[0]!)}`))) return;
			setExpanded(item, nodes.get(item)!, !nodes.get(item)!.expanded);
			const button = item.querySelector<HTMLElement>(':scope > [role=button]')!;
			tree.querySelector<HTMLElement>('[role=button][tabindex="0"]')?.setAttribute('tabindex', '-1');
			button.tabIndex = 0;
			button.focus();
		});
		tree.addEventListener('keydown', (event) => {
			const e = event as KeyboardEvent;
			const item = itemOf(e.target);
			if (!item) return;
			if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
				e.preventDefault();
				setExpanded(item, nodes.get(item)!, e.key === 'ArrowRight');
			} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault();
				const buttons = [...tree.querySelectorAll<HTMLElement>('[role=button]')];
				const current = buttons.findIndex((b) => b.tabIndex === 0);
				if (current < 0) return;
				const next = (current + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
				buttons[current]!.tabIndex = -1;
				buttons[next]!.tabIndex = 0;
				buttons[next]!.focus();
			}
		});
	}
}
