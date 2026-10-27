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

// dynamic.tsx's newItem: one object, made once per demo, so every add inserts the same item.
const newItemId = new WeakMap<Element, string>();

export const DEMO_PARTS: readonly Part[] = [modalDemos, progressDemos, carouselDemos, collapsibleDemos, comboboxDemos, selectDemos];
