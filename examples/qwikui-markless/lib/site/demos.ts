import type { Part } from '../parts/index.ts';
import { autoplaying, goTo, setAutoplay } from '../parts/qwik-ui/carousel.ts';
import { openItem } from '../parts/qwik-ui/collapsible.ts';
import { close, show } from '../parts/qwik-ui/modal.ts';

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
// dynamic.tsx's newItem: one object, made once per demo, so every add inserts the same item.
const newItemId = new WeakMap<Element, string>();

export const DEMO_PARTS: readonly Part[] = [modalDemos, progressDemos, carouselDemos, collapsibleDemos];
