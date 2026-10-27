import type { Part } from '../parts/index.ts';
import { autoplaying, goTo, setAutoplay } from '../parts/qwik-ui/carousel.ts';
import { openItem } from '../parts/qwik-ui/collapsible.ts';
import { chooseItem, listOpen, setListOpen } from '../parts/qwik-ui/combobox.ts';
import { close, show } from '../parts/qwik-ui/modal.ts';
import { chooseItem as chooseOption, openList } from '../parts/qwik-ui/select.ts';

// The docs pages' example components (apps/website/src/routes/docs/**/examples), each control found by the handler it ran
// on the old page (data-mm-qwik). Library behaviour comes from the ports in ../parts.
const on = (event: string, handler: string) => `[data-mm-qwik~="${event}:${handler}"]`;
// A Modal.Root renders a <div> around its dialog.
const dialogAfter = (el: Element) => el.nextElementSibling?.querySelector<HTMLDialogElement>(':scope > dialog[id$="-root"]');

// headless modal programmatic.tsx: a button outside the Modal sets its bind:show signal; styled modal hero.tsx and sheet.tsx:
// Save sets it false.
const modalDemos: Part = {
	click(target) {
		const opener = target.closest(on('click', 'programmatic.tsx_programmatic_component_Fragment_button_onClick'));
		const dialog = opener && dialogAfter(opener);
		if (dialog) {
			show(dialog);
			return true;
		}
		const save = target.closest(`${on('click', 'hero.tsx_hero_component_footer_Button_onClick')}, ${on('click', 'sheet.tsx_Sheet_component_footer_Button_onClick')}`);
		const owner = save?.closest('dialog');
		if (!owner) return false;
		close(owner);
		return true;
	},
};

// A Qwik UI Progress.Root and its indicator as progress-root.tsx and progress-indicator.tsx render them for value, min
// and max. The server repeats the props it was given (value, min, max) on the root; Qwik's re-render keeps only value.
function setProgress(root: Element, next: { value?: number; min?: number; max?: number }): void {
	const min = next.min ?? Number(root.getAttribute('aria-valuemin') ?? 0);
	const max = next.max ?? Number(root.getAttribute('aria-valuemax') ?? 100);
	const value = next.value ?? Number(root.getAttribute('aria-valuenow'));
	const progress = (value - min) / (max - min);
	const data = { 'data-progress': progress >= 1 ? 'complete' : 'loading', 'data-value': String(value), 'data-max': String(max), 'data-min': String(min) };
	const indicator = root.querySelector<HTMLElement>('[title="progress_indicator"]');
	for (const [name, v] of Object.entries(data)) {
		root.setAttribute(name, v);
		indicator?.setAttribute(name, v);
	}
	root.setAttribute('aria-valuemax', String(max));
	root.setAttribute('aria-valuemin', String(min));
	root.setAttribute('aria-valuenow', String(value));
	root.setAttribute('aria-valuetext', `${Math.round(progress * 100)}%`);
	if (root.hasAttribute('value')) root.setAttribute('value', String(value));
	root.removeAttribute('min');
	root.removeAttribute('max');
	if (indicator) indicator.style.transform = `translateX(-${100 - progress * 100}%)`;
}

// Inserts what a client-rendered example shows once its button set its signal, right after the button.
function renderAfter(button: Element, html: string): void {
	if (button.nextElementSibling?.hasAttribute('data-mm-rendered')) return;
	const t = document.createElement('template');
	t.innerHTML = html;
	for (const el of t.content.children) el.setAttribute('data-mm-rendered', '');
	button.after(t.content);
}

const PROGRESS_30 = '<div role="progressbar" aria-label="progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow="30" aria-valuetext="30%" data-progress="loading" data-value="30" data-max="100" data-min="0" value="30" class="progress"><div title="progress_indicator" data-progress="loading" data-value="30" data-max="100" data-min="0" class="progress-indicator" style="transform: translateX(-70%);"></div></div>';

// progress min.tsx and max.tsx: - and + step the bound and the number shown beside them; reactive.tsx sets bind:value to 70;
// csr.tsx renders a 30% bar.
const progressDemos: Part = {
	click(target) {
		const step = target.closest<HTMLElement>(
			[on('click', 'min.tsx_min_component_decrementMin'), on('click', 'min.tsx_min_component_incrementMin'), on('click', 'max.tsx_max_component_decrement'), on('click', 'max.tsx_max_component_increment')].join(', '),
		);
		if (step) {
			const row = step.parentElement!;
			const shown = row.querySelector('span')!;
			const root = row.parentElement?.querySelector(':scope > [role="progressbar"]');
			const handler = step.getAttribute('data-mm-qwik')!;
			if (handler.includes('min.tsx')) {
				const min = Number(shown.textContent!.replace('$', ''));
				const next = handler.endsWith('decrementMin') ? (min > 0 ? min - 500 : min) : min < 5000 ? min + 500 : min;
				shown.textContent = `$${next}`;
				if (root) setProgress(root, { min: next });
			} else {
				const total = Number(shown.textContent);
				const next = handler.endsWith('decrement') ? (total > 20 ? total - 1 : total) : total + 1;
				shown.textContent = String(next);
				if (root) setProgress(root, { max: next });
			}
			return true;
		}
		const change = target.closest(on('click', 'reactive.tsx_reactive_component_Fragment_button_onClick'));
		const bar = change?.previousElementSibling;
		if (change && bar?.matches('[role="progressbar"]')) {
			setProgress(bar, { value: 70 });
			return true;
		}
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		if (render?.textContent?.trim() === 'Render the progress bar') {
			renderAfter(render, PROGRESS_30);
			return true;
		}
		return false;
	},
};

// A Carousel.Root of colour slides as carousel/root.tsx and slide.tsx first render it in the browser.
const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];
const SCROLL_MARK = (edge: string, hidden: boolean) => `<div data-qui-scroll-start="" data-orientation="horizontal"${hidden ? ' hidden=""' : ''} data-${edge}=""></div>`;
const carouselMarkup = (id: string) =>
	`<div role="group" aria-roledescription="carousel" aria-live="polite" data-qui-carousel="" aria-label="content slideshow" _numslides="7" class="carousel-root" style="--slides-per-view: 1; --gap: 0px; --scroll-snap-align: start; --orientation: row; --max-slide-height: undefinedpx;"><div class="carousel-buttons"><button aria-disabled="true" disabled="" data-qui-carousel-prev="" aria-label="previous slide">Prev</button><button aria-disabled="false" data-qui-carousel-next="" aria-label="next slide">Next</button></div><div data-qui-carousel-viewport=""><div data-qui-carousel-scroller="" data-draggable="" data-align="start" data-orientation="horizontal" class="carousel-scroller">${COLORS.map(
		(color, i) =>
			`${SCROLL_MARK('start', i > 0)}<div${i ? ' inert=""' : ''} aria-roledescription="slide" data-orientation="horizontal" data-qui-carousel-slide=""${i ? '' : ' data-active=""'} aria-label="${i + 1} of 7" id="${id}-${i}" class="carousel-slide">${color}${SCROLL_MARK('center', true)}</div>${SCROLL_MARK('end', true)}`,
	).join('')}</div></div></div>`;
const PLAY = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
const PAUSE = '<rect height="16" width="4" x="6" y="4"></rect><rect height="16" width="4" x="14" y="4"></rect>';

// carousel reactive.tsx: bind:selectedIndex shown on a button, and set to 4 by another; player.tsx: bind:autoplay drawn as
// the player's icon and an isPlaying line, and toggled by a button; csr.tsx: a button renders and removes a carousel.
const carouselBeside = (el: Element) => el.parentElement?.querySelector(':scope > [data-qui-carousel]');
const carouselDemos: Part = {
	idle() {
		document.addEventListener('qui-carousel-index', (event) => {
			const shown = [...((event.target as Element).parentElement?.children ?? [])].find((el) => el.tagName === 'BUTTON' && el.textContent?.startsWith('Selected Index: '));
			if (shown) shown.textContent = `Selected Index: ${(event as CustomEvent<number>).detail}`;
		});
		document.addEventListener('qui-carousel-autoplay', (event) => {
			const root = event.target as Element;
			const line = [...(root.parentElement?.children ?? [])].find((el) => el.tagName === 'P' && el.textContent?.startsWith('isPlaying: '));
			if (!line) return;
			const on = (event as CustomEvent<boolean>).detail;
			line.textContent = `isPlaying: ${on}`;
			const icon = root.querySelector('[data-qui-carousel-player] svg');
			if (icon) icon.innerHTML = on ? PAUSE : PLAY;
		});
	},
	click(target) {
		const index = target.closest(on('click', 'reactive.tsx_reactive_component_Fragment_button_onClick'));
		const indexed = index && carouselBeside(index);
		if (indexed) {
			goTo(indexed, 4);
			return true;
		}
		const toggle = target.closest(on('click', 'player.tsx_player_component_Fragment_button_onClick'));
		const played = toggle && carouselBeside(toggle);
		if (played) {
			setAutoplay(played, !autoplaying(played));
			return true;
		}
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		if (render?.textContent?.trim() === 'Render Carousel') {
			const shown = render.nextElementSibling;
			if (shown?.hasAttribute('data-mm-rendered')) shown.remove();
			else renderAfter(render, carouselMarkup(`mm-csr-carousel`));
			return true;
		}
		return false;
	},
};

// Collapsible and Accordion items as collapsible-root.tsx, accordion-item.tsx and their trigger and content render them in
// the browser (an accordion item's trigger sits in an <h3>, its content is a region).
const CHEVRON = '<svg data-qwikest-icon="" fill="none" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="m6 9 6 6 6-6"></path></svg>';
const item = (id: string, trigger: string, content: string, accordion: boolean) => {
	const button = `<button aria-disabled="false" data-closed="" aria-expanded="false" class="collapsible-trigger" id="${id}-trigger" aria-controls="${id}-content">${trigger}</button>`;
	return `<div data-collapsible="" aria-live="polite" id="${id}" data-closed="" class="collapsible">${accordion ? `<h3>${button}</h3>` : button}<div data-collapsible-content="" hidden=""${accordion ? ' role="region"' : ''} class="collapsible-content collapsible-content-outline" id="${id}-content" aria-labelledby="${id}-trigger">${content}</div></div>`;
};
const isOpen = (root: Element) => root.hasAttribute('data-open');
let made = 0;
const freshId = () => `mm-demo-${++made}`;

// collapsible programmatic.tsx: a checkbox bound to bind:open, with an "is open" line; animation.tsx: a button toggles
// bind:open; csr.tsx: a button renders one. accordion programmatic.tsx: a button toggles the first item through
// bind:value; dynamic.tsx: Add Item and Remove Item splice the items at the indexes typed (from 2 to 6 items, each
// content showing its index); csr.tsx: a button renders three items.
const collapsibleDemos: Part = {
	idle() {
		document.addEventListener('qui-collapsible-open', (event) => {
			const root = event.target as Element;
			const box = root.parentElement?.querySelector<HTMLInputElement>(`:scope > input${on('input', 'programmatic.tsx_programmatic_component_Fragment_input_bind_checked')}`);
			if (!box) return;
			const open = (event as CustomEvent<boolean>).detail;
			box.checked = open;
			const line = box.nextElementSibling?.querySelector('strong');
			if (line) line.textContent = String(open);
		});
	},
	input(target) {
		if (!(target instanceof HTMLInputElement) || !target.matches(on('input', 'programmatic.tsx_programmatic_component_Fragment_input_bind_checked'))) return false;
		const root = target.parentElement?.querySelector(':scope > [data-collapsible]');
		if (root) openItem(root, target.checked);
		return true;
	},
	click(target) {
		const animation = target.closest(on('click', 'animation.tsx_animation_component_div_button_onClick'));
		const animated = animation?.parentElement?.querySelector(':scope > [data-collapsible]');
		if (animated) {
			openItem(animated, !isOpen(animated));
			return true;
		}
		const first = target.closest(on('click', 'programmatic.tsx_programmatic_component_Fragment_button_onClick'));
		const accordion = first?.previousElementSibling;
		if (accordion?.matches('[data-accordion]')) {
			const one = accordion.querySelector(':scope > [data-collapsible]');
			if (!one) return true;
			openItem(one, !isOpen(one));
			return true;
		}
		const change = target.closest(`${on('click', 'dynamic.tsx_dynamic_component_Fragment_div_button_onClick')}, ${on('click', 'dynamic.tsx_dynamic_component_Fragment_div_button_onClick_1')}`);
		const list = change?.parentElement?.previousElementSibling;
		if (change && list?.matches('[data-accordion]')) {
			const inputs = list.previousElementSibling?.querySelectorAll('input') ?? [];
			const items = [...list.querySelectorAll(':scope > [data-collapsible]')];
			const adding = change.getAttribute('data-mm-qwik')!.endsWith('_onClick');
			const at = parseInt(inputs[adding ? 0 : 1]?.value ?? '0');
			if (adding && items.length < 6) {
				const t = document.createElement('template');
				t.innerHTML = item(newItemId.get(list) ?? newItemId.set(list, String(Math.random())).get(list)!, 'New Item', '', true);
				const added = t.content.firstElementChild!;
				const before = items.at(at);
				if (before && at >= -items.length) list.insertBefore(added, before);
				else list.append(added);
			} else if (!adding && items.length > 2) items.at(at)?.remove();
			[...list.querySelectorAll(':scope > [data-collapsible] > [data-collapsible-content]')].forEach((content, i) => (content.textContent = `index: ${i}`));
			return true;
		}
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		const label = render?.textContent?.trim();
		if (render && label === 'Render Collapsible') {
			renderAfter(render, item(freshId(), `<span>Trigger</span>${CHEVRON}`, 'Content', false));
			return true;
		}
		if (render && label === 'Render Accordion') {
			renderAfter(render, `<div data-accordion="">${[1, 2, 3].map((n) => item(freshId(), `<span>Trigger ${n}</span>${CHEVRON}`, `Inside Content ${n}`, true)).join('')}</div>`);
			return true;
		}
		return false;
	},
};
const ICON = (inner: string, cls = '') => `<svg data-qwikest-icon="" fill="none" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''}>${inner}</svg>`;
const CHECK = ICON('<polyline points="20 6 9 17 4 12"></polyline>');
const FRUITS = ['Apple', 'Apricot', 'Bilberry', 'Blackberry', 'Blackcurrant', 'Currant', 'Cherry', 'Coconut'];
// A Combobox.Item as combobox-item.tsx renders it.
const comboboxItem = (id: string, i: number, label: string) =>
	`<div role="option" tabindex="-1" id="${id}-${i}" aria-selected="false" aria-disabled="false" data-item="" aria-labelledby="${id}-${i}-item-label" class="combobox-item" _index="${i}"><span tabindex="-1" id="${id}-${i}-item-label">${label}</span><span data-item-indicator="" aria-hidden="true">${CHECK}</span></div>`;
// A Combobox.Root with a label, control and popover as combobox/*.tsx first render it in the browser; the panel's placement
// is what convert writes for the server-rendered ones (bottom, the example's gutter).
const comboboxMarkup = (id: string, label: string, items: readonly string[]) =>
	`<div role="group" data-combobox-root="" data-closed="" aria-invalid="false" class="combobox-root"><label id="${id}-label" class="combobox-label">${label}</label><div data-combobox-control="" class="combobox-control"><input role="combobox" aria-activedescendant="" aria-expanded="false" aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off" data-combobox-input="" id="${id}-input" aria-controls="${id}-panel" aria-labelledby="${id}-label" aria-describedby="${id}-description \n        ${id}-error-message" class="combobox-input"><button type="button" aria-expanded="false" data-closed="" tabindex="-1" class="combobox-trigger">${ICON('<path d="m6 9 6 6 6-6"></path>', 'combobox-icon')}</button></div><div id="${id}-root"><div popover="manual" hidden="" data-floating="absolute" id="${id}-panel" data-closed="" role="listbox" aria-expanded="false" class="combobox-popover" data-mm-placement="bottom" data-mm-gutter="8">${items.map((x, i) => comboboxItem(id, i, x)).join('')}</div></div></div>`;
const rootBefore = (el: Element, selector: string) => {
	for (let at = el.previousElementSibling; at; at = at.previousElementSibling) if (at.matches(selector)) return at;
	return null;
};
// The answer form.tsx shows once a submit carried a value: what the named field held, as JSON.
function showSubmitted(form: HTMLFormElement, name: string): void {
	const value = new FormData(form).get(name);
	let shown = form.querySelector<HTMLElement>(':scope > [data-mm-submitted]');
	if (!value) return void shown?.remove();
	if (!shown) {
		shown = document.createElement('div');
		shown.setAttribute('data-mm-submitted', '');
		shown.innerHTML = '<strong>You submitted:</strong><code></code>';
		form.append(shown);
	}
	shown.querySelector('code')!.textContent = JSON.stringify(value);
}

// combobox programmatic.tsx: Change to Abby writes bind:value; add-items.tsx: Add Fruits adds three items once;
// reactive-open.tsx: a button toggles bind:open; refs.tsx: the trigger's own click paints it red (the port still opens the
// list); form.tsx: submitting shows the chosen fruit; csr.tsx: a button renders a combobox.
// The open state reactive-open.tsx's button reads, as it was before the press reached the window (where a press outside
// an open list closes it).
const openAtPress = new WeakMap<Element, boolean>();
const comboboxDemos: Part = {
	pointerdown(target) {
		const toggle = target.closest(on('click', 'reactive-open.tsx_reactive_open_component_Fragment_button_onClick'));
		const root = toggle && rootBefore(toggle, '[data-combobox-root]');
		if (root) openAtPress.set(root, listOpen(root));
		return false;
	},
	submit(target, event) {
		if (!(target instanceof HTMLFormElement) || !target.matches(on('submit', 'form.tsx_form_component_handleSubmit')) || !target.querySelector('[data-combobox-root]')) return false;
		event.preventDefault();
		const name = target.querySelector('select')?.name;
		if (name) showSubmitted(target, name);
		return true;
	},
	click(target) {
		if (target.closest(on('click', 'refs.tsx_refs_component_handleClick'))) {
			(target.closest('button') as HTMLElement).style.backgroundColor = 'red';
			return false;
		}
		const abby = target.closest(on('click', 'programmatic.tsx_programmatic_component_Fragment_button_onClick'));
		const chosen = abby && rootBefore(abby, '[data-combobox-root]');
		if (chosen) {
			const item = [...document.querySelectorAll(`#${CSS.escape(chosen.querySelector('input')!.getAttribute('aria-controls')!)} [role="option"]`)].find((i) => i.textContent?.trim() === 'Abby');
			if (item) chooseItem(item);
			return true;
		}
		const add = target.closest(on('click', 'add-items.tsx_add_items_component_Fragment_button_onClick'));
		const grown = add && rootBefore(add, '[data-combobox-root]');
		if (grown) {
			const panel = document.getElementById(grown.querySelector('input')!.getAttribute('aria-controls')!);
			if (panel && !panel.hasAttribute('data-mm-added')) {
				panel.setAttribute('data-mm-added', '');
				const id = panel.id.replace(/-panel$/, '');
				const t = document.createElement('template');
				t.innerHTML = ['Durian', 'Jackfruit', 'Ackee'].map((x, i) => comboboxItem(id, FRUITS.length + i, x)).join('');
				panel.append(t.content);
			}
			return true;
		}
		const toggle = target.closest(on('click', 'reactive-open.tsx_reactive_open_component_Fragment_button_onClick'));
		const opened = toggle && rootBefore(toggle, '[data-combobox-root]');
		if (opened) {
			setListOpen(opened, !(openAtPress.get(opened) ?? listOpen(opened)));
			openAtPress.delete(opened);
			return true;
		}
		// The select and combobox pages' csr.tsx share a handler name; the page tells them apart.
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		if (render?.textContent?.trim() === 'CSR mode' && location.pathname.startsWith('/docs/headless/combobox')) {
			renderAfter(render, comboboxMarkup(freshId(), 'Personal Trainers', FRUITS));
			return true;
		}
		return false;
	},
};

const USERS = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];
const selectItem = (id: string, i: number, label: string) => `<div tabindex="-1" aria-selected="false" aria-disabled="false" data-item="" role="option" id="${id}-${i}"><span tabindex="-1">${label}</span></div>`;
// A Select.Root as select/*.tsx first render it in the browser; the panel's placement is what convert writes for the
// server-rendered ones. Its shown value is the trigger's own text here (the server-rendered ones' is Markless state).
const selectMarkup = (id: string) =>
	`<div role="group" data-qui-select-root="" data-closed="" aria-invalid="false" class="select" data-mm-own-value=""><div id="${id}-label">Logged in users</div><button data-closed="" aria-expanded="false" aria-haspopup="listbox" class="select-trigger" id="${id}-trigger" aria-labelledby="${id}-value ${id}-label " aria-describedby="${id}-description \n      ${id}-error-message" aria-controls="${id}-panel"><span data-closed="" data-value="" id="${id}-value">Select an option</span></button><div id="${id}-root"><div popover="manual" hidden="" data-floating="absolute" id="${id}-panel" data-closed="" role="listbox" aria-labelledby="${id}-trigger" class="select-popover" data-mm-placement="bottom" data-mm-gutter="0">${USERS.map((u, i) => selectItem(id, i, u)).join('')}</div></div></div>`;
const optionsOf = (root: Element) => [...(document.getElementById(root.querySelector('[aria-haspopup="listbox"]')?.getAttribute('aria-controls') ?? '')?.querySelectorAll('[role="option"]') ?? [])];

// select controlled-value.tsx: Change to Abby writes bind:value; bind-open.tsx: a button sets bind:open; add-users.tsx: Add
// Users adds three items once; form.tsx: submitting shows what the form carried; csr.tsx: a button renders a select.
const selectDemos: Part = {
	idle() {
		document.addEventListener('mmchoose', (event) => {
			const root = (event.target as Element).closest('[data-mm-own-value]');
			const shown = root?.querySelector('[data-value]');
			if (shown) shown.textContent = (event as CustomEvent<string>).detail;
		});
	},
	submit(target, event) {
		if (!(target instanceof HTMLFormElement) || !target.matches(on('submit', 'form.tsx_form_component_handleSubmit')) || !target.querySelector('[data-qui-select-root]')) return false;
		event.preventDefault();
		const name = target.querySelector('select')?.name ?? '';
		const data = { [name]: new FormData(target).getAll(name) };
		let shown = target.nextElementSibling?.hasAttribute('data-mm-submitted') ? target.nextElementSibling : null;
		if (!shown) {
			const t = document.createElement('template');
			t.innerHTML = '<strong data-mm-submitted="">You submitted:</strong><code data-mm-submitted=""></code>';
			target.after(t.content);
			shown = target.nextElementSibling!;
		}
		shown.nextElementSibling!.textContent = JSON.stringify(data);
		return true;
	},
	click(target) {
		const abby = target.closest(on('click', 'controlled-value.tsx_controlled_value_component_Fragment_button_onClick'));
		const valued = abby && rootBefore(abby, '[data-qui-select-root]');
		if (valued) {
			const item = optionsOf(valued).find((i) => i.textContent?.trim() === 'Abby');
			if (item) chooseOption(item);
			return true;
		}
		const opener = target.closest(on('click', 'bind-open.tsx_bind_open_component_Fragment_button_onClick'));
		const opened = opener?.nextElementSibling;
		if (opened?.matches('[data-qui-select-root]')) {
			openList(opened);
			return true;
		}
		const add = target.closest(on('click', 'add-users.tsx_add_users_component_Fragment_button_onClick'));
		const grown = add && rootBefore(add, '[data-qui-select-root]');
		if (grown) {
			const panel = optionsOf(grown)[0]?.parentElement;
			if (panel && !panel.hasAttribute('data-mm-added')) {
				panel.setAttribute('data-mm-added', '');
				const id = panel.id.replace(/-panel$/, '');
				const t = document.createElement('template');
				t.innerHTML = ['John', 'Jane', 'Bob'].map((u, i) => selectItem(id, USERS.length + i, u)).join('');
				panel.append(t.content);
			}
			return true;
		}
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		if (render?.textContent?.trim() === 'CSR mode' && location.pathname.startsWith('/docs/headless/select')) {
			renderAfter(render, selectMarkup(freshId()));
			return true;
		}
		return false;
	},
};

// toggle bind-pressed.tsx: "I can only press" sets bind:pressed true; toggle-group value-bind.tsx: "I can only press
// 'right'" sets bind:value to right. The pressed state and the line it shows are Markless state, so the control is used.
// tabs on-click.tsx: the first tab's own click writes "Jack" into it. popover programmatic.tsx: the button's click, and
// its "o" key, toggle the manual popover; toggle-event.tsx: the panel's toggle event shows its new state in a line.
// tooltip placement.tsx: the select re-creates the tooltip on the side chosen.
const pressUnlessPressed = (control: Element | null | undefined) => {
	if (control instanceof HTMLElement && control.getAttribute('aria-pressed') !== 'true') control.click();
};
// bind:anchor is the invoking button: the popover port places a panel against the element its data-mm-anchor names.
function programmaticPanel(invoker: Element): HTMLElement | null {
	const panel = document.getElementById(`${invoker.closest('[id$="-root"]')?.id.replace(/-root$/, '') ?? ''}-panel`);
	if (panel && !panel.dataset.mmAnchor) {
		invoker.id ||= `${panel.id}-anchor`;
		panel.dataset.mmAnchor = invoker.id;
	}
	return panel;
}
const otherDemos: Part = {
	idle() {
		document.addEventListener(
			'toggle',
			(event) => {
				const panel = event.target as Element;
				if (!panel.matches?.(on('toggle', 'toggle-event.tsx_toggle_event_component_onToggle'))) return;
				const line = panel.parentElement?.querySelector(':scope > p');
				if (line) line.textContent = `Panel is ${(event as ToggleEvent).newState}!`;
			},
			true,
		);
	},
	keydown(target, event) {
		const invoker = target.closest(on('keydown', 'programmatic.tsx_programmatic_component_button_onKeyDown'));
		if (!invoker || event.key !== 'o') return false;
		programmaticPanel(invoker)?.togglePopover();
		return true;
	},
	input(target) {
		if (!(target instanceof HTMLSelectElement) || !target.matches(on('change', 'placement.tsx_placement_component_div_select_onChange'))) return false;
		const panel = target.parentElement?.querySelector<HTMLElement>('[role="tooltip"]');
		if (panel) {
			panel.dataset.mmPlacement = target.value;
			panel.setAttribute('aria-label', `Tooltip content on the ${target.value}`);
			panel.textContent = `Tooltip content on the ${target.value}`;
		}
		return true;
	},
	click(target, event) {
		const only = target.closest(on('click', 'bind-pressed.tsx_bind_pressed_component_div_button_onClick'));
		if (only) {
			pressUnlessPressed(only.parentElement?.querySelector('button[aria-pressed]'));
			return true;
		}
		const right = target.closest(on('click', 'value-bind.tsx_value_bind_component_div_button_onClick'));
		if (right) {
			pressUnlessPressed(right.parentElement?.querySelector('[data-qui-togglegroup-item][aria-label="Right aligned"]'));
			return true;
		}
		const maria = target.closest(on('click', 'on-click.tsx_on_click_component_Fragment_div_onClick'));
		if (maria) maria.innerHTML = 'Jack';
		const invoker = target.closest(on('click', 'programmatic.tsx_programmatic_component_button_onClick'));
		const panel = invoker && programmaticPanel(invoker);
		if (panel) {
			event.preventDefault();
			panel.togglePopover();
			return true;
		}
		return false;
	},
};

// tabs dynamic.tsx: a store of labels drawn by index (key={i}): Add Tab before and after add "Added Tab" at either end, a
// tab's x removes its label (one stays); the tab and panel elements stay in place and their text moves, one element more
// or fewer at the end.
function relabel(root: Element, labels: readonly string[]): void {
	const list = root.querySelector('[role="tablist"]')!;
	let tabs = [...list.querySelectorAll<HTMLElement>(':scope > [role="tab"]')];
	let panels = [...root.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]')];
	const base = tabs[0]!.id.replace(/_tab_\d+$/, '');
	while (tabs.length < labels.length) {
		const i = tabs.length;
		const tab = tabs.at(-1)!.cloneNode(true) as HTMLElement;
		Object.assign(tab, { id: `${base}_tab_${i}`, tabIndex: -1 });
		tab.setAttribute('aria-controls', `${base}_tabpanel_${i}`);
		tab.setAttribute('data-state', 'unselected');
		tab.setAttribute('aria-selected', 'false');
		tab.removeAttribute('class');
		list.append(tab);
		const panel = panels.at(-1)!.cloneNode(true) as HTMLElement;
		panel.id = `${base}_tabpanel_${i}`;
		panel.setAttribute('aria-labelledby', tab.id);
		panel.hidden = true;
		panels.at(-1)!.after(panel);
		tabs = [...tabs, tab];
		panels = [...panels, panel];
	}
	tabs.slice(labels.length).forEach((t) => t.remove());
	panels.slice(labels.length).forEach((p) => p.remove());
	labels.forEach((label, i) => {
		tabs[i]!.firstChild!.textContent = `${label} `;
		panels[i]!.textContent = `${label} Panel`;
	});
}
const labelsOf = (root: Element) => [...root.querySelectorAll(':scope > [role="tablist"] > [role="tab"]')].map((t) => t.firstChild?.textContent?.trim() ?? '');
const tabsDemo: Part = {
	click(target) {
		const add = target.closest(`${on('click', 'dynamic.tsx_dynamic_component_Fragment_div_button_onClick')}, ${on('click', 'dynamic.tsx_dynamic_component_Fragment_div_button_onClick_1')}`);
		const root = add?.parentElement?.querySelector(':scope > [data-qui-tabs-root]');
		if (add && root) {
			const labels = labelsOf(root);
			if (add.getAttribute('data-mm-qwik')!.endsWith('_1')) labels.push('Added Tab');
			else labels.unshift('Added Tab');
			relabel(root, labels);
			return true;
		}
		const x = target.closest(on('click', 'dynamic.tsx_dynamic_component_Fragment_div_span_onClick'));
		const tab = x?.closest('[role="tab"]');
		const tabs = tab?.closest('[data-qui-tabs-root]');
		if (tab && tabs) {
			const labels = labelsOf(tabs);
			if (labels.length > 1) {
				labels.splice([...tab.parentElement!.children].indexOf(tab), 1);
				relabel(tabs, labels);
			}
		}
		return false;
	},
};

// confetti-button.tsx: canvas-confetti bursts from the button's top (the intro's in the JavaScript logo's shape), and the
// intro's button says its click ran. contributing the-problem.tsx and inline.tsx: "render on the client" renders four
// items (numbered in the order their tasks ran: 4, 1, 2, 3; and 1 to 4 in a wrapper).
const JS_LOGO = [
	'M0 0h1052v1052H0z',
	'M965.9 801.1c-7.7-48-39-88.3-131.7-125.9-32.2-14.8-68.1-25.399-78.8-49.8-3.8-14.2-4.3-22.2-1.9-30.8 6.9-27.9 40.2-36.6 66.6-28.6 17 5.7 33.1 18.801 42.8 39.7 45.4-29.399 45.3-29.2 77-49.399-11.6-18-17.8-26.301-25.4-34-27.3-30.5-64.5-46.2-124-45-10.3 1.3-20.699 2.699-31 4-29.699 7.5-58 23.1-74.6 44-49.8 56.5-35.6 155.399 25 196.1 59.7 44.8 147.4 55 158.6 96.9 10.9 51.3-37.699 67.899-86 62-35.6-7.4-55.399-25.5-76.8-58.4-39.399 22.8-39.399 22.8-79.899 46.1 9.6 21 19.699 30.5 35.8 48.7 76.2 77.3 266.899 73.5 301.1-43.5 1.399-4.001 10.6-30.801 3.199-72.101zm-394-317.6h-98.4c0 85-.399 169.4-.399 254.4 0 54.1 2.8 103.7-6 118.9-14.4 29.899-51.7 26.2-68.7 20.399-17.3-8.5-26.1-20.6-36.3-37.699-2.8-4.9-4.9-8.7-5.601-9-26.699 16.3-53.3 32.699-80 49 13.301 27.3 32.9 51 58 66.399 37.5 22.5 87.9 29.4 140.601 17.3 34.3-10 63.899-30.699 79.399-62.199 22.4-41.3 17.6-91.3 17.4-146.6.5-90.2 0-180.4 0-270.9z',
];
const pageDemos: Part = {
	click(target) {
		const button = target.closest<HTMLElement>(on('click', 'confetti-button.tsx_ConfettiButton_component_div_div_div_button_onClick'));
		if (button) {
			const intro = button.textContent?.trim() === 'Click me!';
			const row = button.parentElement?.parentElement?.parentElement;
			if (intro && row && !row.querySelector(':scope > p')) row.insertAdjacentHTML('beforeend', '<p>My click event just executed! (not the button component)</p>');
			const rect = button.getBoundingClientRect();
			void import('canvas-confetti').then(({ default: confetti }) =>
				confetti({ colors: intro ? ['#f0db4f'] : ['#02B9FC', '#B57DFC'], shapes: intro ? [confetti.shapeFromPath({ path: JS_LOGO as unknown as string })] : undefined, origin: { x: (rect.left + rect.width / 2) / innerWidth, y: rect.top / innerHeight } }),
			);
			return true;
		}
		const problem = target.closest(on('click', 'the-problem.tsx_the_problem_component_div_button_onClick'));
		if (problem) {
			if (!problem.nextElementSibling) problem.insertAdjacentHTML('afterend', [4, 1, 2, 3].map((n) => `<div>Item ${n}</div>`).join(''));
			return true;
		}
		const inline = target.closest(on('click', 'inline.tsx_inline_component_div_button_onClick'));
		if (inline) {
			if (!inline.nextElementSibling) inline.insertAdjacentHTML('afterend', `<div>${[1, 2, 3, 4].map((n) => `<div>Item ${n}</div>`).join('')}</div>`);
			return true;
		}
		return false;
	},
};

// The examples whose lines count a component's callbacks (onChange$, onOpenChange$, onInput$): accordion on-change.tsx,
// collapsible open-change.tsx, select change-value.tsx and open-change.tsx, combobox change.tsx, input.tsx and
// open-change.tsx, tooltip onChange.tsx. Each line is found by its text in the example's section.
const sectionOf = (el: Element) => el.closest('section');
// The innermost element of the tag whose text starts so: an example's line, not a box around it.
const lineIn = (section: Element | null, start: string, tag = 'p') => [...(section?.querySelectorAll(tag) ?? [])].reverse().find((el) => el.textContent?.trimStart().startsWith(start));
const countIn = (line: Element | undefined) => Number(/\d+/.exec(line?.textContent ?? '')?.[0] ?? 0) + 1;
const callbackDemos: Part = {
	idle() {
		document.addEventListener('qui-collapsible-open', (event) => {
			const item = event.target as Element;
			const section = sectionOf(item);
			const accordionLine = lineIn(section, 'Called change count:');
			if (accordionLine && (event as CustomEvent<boolean>).detail) {
				accordionLine.textContent = `Called change count: ${countIn(accordionLine)}`;
				const items = [...(item.parentElement?.querySelectorAll(':scope > [data-collapsible]') ?? [])];
				const changed = lineIn(section, 'Changed to:');
				if (changed) changed.textContent = `Changed to: item-${items.indexOf(item) + 1}`;
			}
			const count = lineIn(section, 'count:')?.querySelector('strong');
			if (count && !accordionLine) count.textContent = ` ${countIn(count)}`;
		});
		const opened = (event: Event) => {
			const section = sectionOf(event.target as Element);
			const times = lineIn(section, 'The listbox opened and closed');
			if (times) times.textContent = `The listbox opened and closed ${countIn(times)} time(s)`;
			const now = lineIn(section, 'It is currently:', 'span');
			if (now) now.textContent = `It is currently: ${(event as CustomEvent<boolean>).detail ? 'open' : 'closed'}`;
		};
		document.addEventListener('qui-select-open', opened);
		document.addEventListener('qui-combobox-open', opened);
		const changed = (event: Event) => {
			const line = lineIn(sectionOf(event.target as Element), 'You have changed');
			if (line) line.textContent = `You have changed ${countIn(line)} times`;
		};
		document.addEventListener('qui-combobox-change', changed);
		document.addEventListener('mmchoose', (event) => {
			if ((event.target as Element).closest('[data-qui-select-root]')) changed(event);
		});
		document.addEventListener('qui-tooltip-open', (event) => {
			const section = sectionOf(event.target as Element);
			const text = [...(section?.childNodes ?? [])].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.startsWith('The tooltip is '));
			if (!text) return;
			text.textContent = `The tooltip is ${(event as CustomEvent<string>).detail}`;
			while (text.nextSibling?.nodeType === Node.TEXT_NODE) text.nextSibling.remove();
		});
	},
	input(target) {
		if (!(target instanceof HTMLInputElement) || target.getAttribute('role') !== 'combobox') return false;
		const section = sectionOf(target);
		const times = lineIn(section, 'onInput$ was called');
		if (!times) return false;
		times.textContent = `onInput$ was called ${countIn(times)} time(s)`;
		const value = lineIn(section, 'onInput$ value:', 'div');
		if (value) value.textContent = `onInput$ value: ${target.value}`;
		return false;
	},
};

// dynamic.tsx's newItem: one object, made once per demo, so every add inserts the same item.
const newItemId = new WeakMap<Element, string>();

export const DEMO_PARTS: readonly Part[] = [modalDemos, progressDemos, carouselDemos, collapsibleDemos, comboboxDemos, selectDemos, otherDemos, tabsDemo, pageDemos, callbackDemos];
