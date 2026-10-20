// FloatingVue's twoslash theme as @shikijs/vitepress-twoslash sets it up and as it behaves on vite.dev: a type popup
// opens 200 ms after the pointer reaches a token, fixed below it (bottom-start, 5 px away, kept 10 px inside the
// window), stays open until a click outside or a scroll, and fades out over FloatingVue's 150 ms before it is removed.
// Each popup's content is the <template> the page keeps in its trigger.
const SHOW_DELAY = 200;
const HIDE_MS = 150;
const DISTANCE = 5;
const PADDING = 10;
const ARROW_PADDING = 8;
const THEME_CLASSES = 'v-popper__popper v-popper--theme-twoslash v-popper--theme-dropdown shiki twoslash-floating vp-copy-ignore';
const BODY_CLASSES = ['v-popper--some-open', 'v-popper--some-open--twoslash', 'v-popper--some-open--dropdown'];

interface Open {
	readonly trigger: HTMLElement;
	readonly popper: HTMLElement;
}
const open = new Map<HTMLElement, Open>();
let pending: { trigger: HTMLElement; timer: number } | undefined;
let sequence = 0;

const triggerOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.v-popper.twoslash-hover') : null);
const randomId = () => `popper_${Math.random().toString(36).slice(2, 10)}_${(++sequence).toString(36)}`;

function position(trigger: HTMLElement, popper: HTMLElement): void {
	const rect = trigger.getBoundingClientRect();
	const inner = popper.querySelector<HTMLElement>('.v-popper__inner')!;
	const top = rect.bottom + DISTANCE;
	inner.style.maxWidth = `${window.innerWidth - PADDING * 2}px`;
	inner.style.maxHeight = `${window.innerHeight - top - PADDING}px`;
	const width = popper.offsetWidth;
	const left = Math.max(PADDING, Math.min(rect.left, window.innerWidth - PADDING - width));
	popper.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0px)`;
	const arrow = popper.querySelector<HTMLElement>('.v-popper__arrow-container')!;
	const arrowWidth = arrow.offsetWidth;
	const center = rect.left + rect.width / 2 - Math.round(left) - arrowWidth / 2;
	arrow.style.left = `${Math.max(ARROW_PADDING, Math.min(center, width - ARROW_PADDING - arrowWidth))}px`;
}

function show(trigger: HTMLElement): void {
	if (open.has(trigger)) return;
	const template = trigger.querySelector<HTMLTemplateElement>(':scope > template');
	const reference = trigger.firstElementChild instanceof HTMLTemplateElement ? null : trigger.firstElementChild;
	if (!template || !reference) return;
	const popper = document.createElement('div');
	const id = randomId();
	popper.id = id;
	popper.setAttribute('data-allow-mismatch', '');
	popper.className = `${THEME_CLASSES} v-popper__popper--hidden v-popper__popper--hide-to`;
	popper.setAttribute('style', 'position: fixed; transform: translate3d(0px, 0px, 0px);');
	popper.setAttribute('aria-hidden', 'false');
	popper.setAttribute('tabindex', '0');
	popper.setAttribute('data-popper-placement', 'bottom-start');
	popper.innerHTML =
		'<div class="v-popper__backdrop"></div><div class="v-popper__wrapper" style=""><div class="v-popper__inner"><div></div></div><div class="v-popper__arrow-container"><div class="v-popper__arrow-outer"></div><div class="v-popper__arrow-inner"></div></div></div>';
	popper.querySelector('.v-popper__inner > div')!.append(template.content.cloneNode(true));
	document.body.append(popper);
	position(trigger, popper);
	open.set(trigger, { trigger, popper });
	trigger.classList.add('v-popper--shown');
	reference.setAttribute('aria-describedby', id);
	reference.setAttribute('data-popper-shown', '');
	document.body.classList.add(...BODY_CLASSES);
	popper.className = `${THEME_CLASSES} v-popper__popper--shown v-popper__popper--show-from`;
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			if (open.get(trigger)?.popper === popper) popper.className = `${THEME_CLASSES} v-popper__popper--shown v-popper__popper--show-to`;
		}),
	);
}

function hideAll(): void {
	if (pending) {
		clearTimeout(pending.timer);
		pending = undefined;
	}
	if (!open.size) return;
	for (const { trigger, popper } of open.values()) {
		trigger.classList.remove('v-popper--shown');
		const reference = trigger.firstElementChild;
		reference?.removeAttribute('aria-describedby');
		reference?.removeAttribute('data-popper-shown');
		popper.className = `${THEME_CLASSES} v-popper__popper--hidden v-popper__popper--hide-from`;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				popper.className = `${THEME_CLASSES} v-popper__popper--hidden v-popper__popper--hide-to`;
				setTimeout(() => popper.remove(), HIDE_MS);
			}),
		);
	}
	open.clear();
	document.body.classList.remove(...BODY_CLASSES);
}

export function installTwoslash(): void {
	document.addEventListener('mouseover', (event) => {
		const trigger = triggerOf(event.target);
		if (!trigger || open.has(trigger) || pending?.trigger === trigger) return;
		if (pending) clearTimeout(pending.timer);
		pending = {
			trigger,
			timer: window.setTimeout(() => ((pending = undefined), show(trigger)), SHOW_DELAY),
		};
	});
	document.addEventListener('mouseout', (event) => {
		if (!pending || pending.trigger !== triggerOf(event.target) || pending.trigger.contains(event.relatedTarget as Node | null)) return;
		clearTimeout(pending.timer);
		pending = undefined;
	});
	document.addEventListener('mousedown', (event) => {
		const target = event.target as Element | null;
		if (target?.closest?.('.v-popper__popper') || triggerOf(target)) return;
		hideAll();
	});
	window.addEventListener('scroll', hideAll, { passive: true });
	document.addEventListener('marklessrouterrendered', hideAll);
}
