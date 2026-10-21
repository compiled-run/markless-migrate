// Radix Tooltip as the old sidebar's SidebarMenuButton uses it (components/ui/sidebar.tsx, components/ui/tooltip.tsx):
// every nav button is a tooltip trigger with its own provider (delayDuration 0, skipDelayDuration 300). Hovering opens it
// (delayed-open on a timer of 0, instant-open within 300 ms of its last closing), focusing opens it at once, and a press,
// a click, blur, Escape or a scroll around it closes it. The content is portalled to the end of the body, side right,
// align center, and stays hidden unless the sidebar is collapsed on a wide screen.
(() => {
	const TRIGGER = '[data-sidebar=menu-button]:not([data-size=lg])';
	const SKIP_DELAY = 300;
	const CONTENT_CLASS = 'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95';
	const ARROW_CLASS = 'z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-primary fill-primary';
	const CONTENT_STYLE = '--radix-tooltip-content-transform-origin: var(--radix-popper-transform-origin); --radix-tooltip-content-available-width: var(--radix-popper-available-width); --radix-tooltip-content-available-height: var(--radix-popper-available-height); --radix-tooltip-trigger-width: var(--radix-popper-anchor-width); --radix-tooltip-trigger-height: var(--radix-popper-anchor-height);';
	const LABEL_STYLE = 'position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;';
	const OPEN_EVENT = 'tooltip.open';
	let ids = 0;
	const tips = new Map();

	const triggerOf = (target) => (target instanceof Element ? target.closest(TRIGGER) : null);
	const inSidebar = (el) => el.closest('[data-sidebar=sidebar]') !== null;
	const tipOf = (el) => {
		let t = tips.get(el);
		if (!t) {
			t = { open: false, delayed: false, wrapper: null, id: `radix-tooltip-${++ids}`, isOpenDelayed: true, skipTimer: 0, openTimer: 0, pointerDown: false, moved: false, leaving: null };
			tips.set(el, t);
		}
		return t;
	};
	// CollapsibleTrigger's own data-state wins over the tooltip's on the collapsible items.
	const ownsState = (el) => el.getAttribute('data-slot') !== 'collapsible-trigger';
	const hiddenContent = (el) => {
		const sidebar = el.closest('[data-slot=sidebar]');
		return !sidebar || sidebar.getAttribute('data-state') !== 'collapsed' || matchMedia('(max-width: 767px)').matches;
	};
	const label = (el) => (el.querySelector('span:not([data-slot=badge])')?.textContent ?? el.textContent ?? '').trim();

	function place(el, wrapper, content, arrow) {
		const r = el.getBoundingClientRect();
		const shown = !content.hidden;
		const h = shown ? content.offsetHeight : 0;
		// The arrow's height is in the offset only while the arrow is laid out (a hidden content measures it as 0).
		const x = r.right + (shown ? 5 : 0);
		const y = r.top + r.height / 2 - h / 2;
		wrapper.style.cssText = `position: fixed; left: 0px; top: 0px; transform: translate(${Math.round(x)}px, ${Math.round(y)}px); min-width: max-content; --radix-popper-transform-origin: ${shown ? `-5px ${Math.round(h / 2)}px` : '0px 0px'}; z-index: 50; --radix-popper-available-width: ${Math.round(innerWidth - x)}px; --radix-popper-available-height: ${innerHeight}px; --radix-popper-anchor-width: ${Math.round(r.width)}px; --radix-popper-anchor-height: ${Math.round(r.height)}px;`;
		arrow.style.cssText = `position: absolute; left: 0px; transform-origin: 0px 0px; transform: translateY(50%) rotate(90deg) translateX(-50%); top: ${shown ? `${Math.round(h / 2 - 5)}px` : '0px'};`;
	}

	function render(el, t) {
		const text = label(el);
		const wrapper = document.createElement('div');
		wrapper.setAttribute('data-radix-popper-content-wrapper', '');
		const content = document.createElement('div');
		content.setAttribute('data-side', 'right');
		content.setAttribute('data-align', 'center');
		content.setAttribute('data-state', t.delayed ? 'delayed-open' : 'instant-open');
		content.setAttribute('data-slot', 'tooltip-content');
		content.className = CONTENT_CLASS;
		content.hidden = hiddenContent(el);
		content.setAttribute('style', CONTENT_STYLE);
		content.append(text);
		const arrow = document.createElement('span');
		arrow.innerHTML = `<svg class="${ARROW_CLASS}" width="10" height="5" viewBox="0 0 30 10" preserveAspectRatio="none" style="display: block;"><polygon points="0,0 30,0 15,10"></polygon></svg>`;
		const name = document.createElement('span');
		name.id = t.id;
		name.setAttribute('role', 'tooltip');
		name.setAttribute('style', LABEL_STYLE);
		name.textContent = text;
		content.append(arrow, name);
		wrapper.append(content);
		document.body.append(wrapper);
		place(el, wrapper, content, arrow);
		return wrapper;
	}

	function open(el, delayed) {
		const t = tipOf(el);
		clearTimeout(t.openTimer);
		if (t.open) return;
		// The provider: within its skip delay the next opening is instant.
		clearTimeout(t.skipTimer);
		t.isOpenDelayed = false;
		document.dispatchEvent(new CustomEvent(OPEN_EVENT));
		t.open = true;
		t.delayed = delayed;
		if (ownsState(el)) el.setAttribute('data-state', delayed ? 'delayed-open' : 'instant-open');
		el.setAttribute('aria-describedby', t.id);
		t.wrapper = render(el, t);
	}

	function close(el) {
		const t = tips.get(el);
		if (!t) return;
		clearTimeout(t.openTimer);
		stopLeaving(t);
		if (!t.open) return;
		t.open = false;
		clearTimeout(t.skipTimer);
		t.skipTimer = setTimeout(() => {
			t.isOpenDelayed = true;
		}, SKIP_DELAY);
		if (ownsState(el)) el.setAttribute('data-state', 'closed');
		el.removeAttribute('aria-describedby');
		t.wrapper?.remove();
		t.wrapper = null;
	}

	const closeAll = () => {
		for (const [el, t] of tips) if (t.open) close(el);
	};

	function stopLeaving(t) {
		if (t.leaving) document.removeEventListener('pointermove', t.leaving);
		t.leaving = null;
	}

	document.addEventListener(OPEN_EVENT, closeAll);

	document.addEventListener('pointermove', (event) => {
		const el = triggerOf(event.target);
		if (!el || event.pointerType === 'touch' || !inSidebar(el)) return;
		const t = tipOf(el);
		if (t.moved) return;
		t.moved = true;
		stopLeaving(t);
		if (t.isOpenDelayed) {
			clearTimeout(t.openTimer);
			t.openTimer = setTimeout(() => open(el, true), 0);
		} else open(el, false);
	});

	// Leaving towards the content keeps it open; the next move anywhere else outside the trigger closes it.
	document.addEventListener('pointerout', (event) => {
		const el = triggerOf(event.target);
		if (!el || !inSidebar(el) || (event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) return;
		const t = tipOf(el);
		t.moved = false;
		clearTimeout(t.openTimer);
		if (!t.open) return;
		stopLeaving(t);
		setTimeout(() => {
			if (!t.open || t.leaving) return;
			t.leaving = (move) => {
				const at = move.target instanceof Node ? move.target : null;
				if (at && (el.contains(at) || t.wrapper?.contains(at))) return stopLeaving(t);
				close(el);
			};
			document.addEventListener('pointermove', t.leaving);
		}, 0);
	});

	document.addEventListener('pointerdown', (event) => {
		const el = triggerOf(event.target);
		if (!el || !inSidebar(el)) return;
		const t = tipOf(el);
		if (t.open) close(el);
		t.pointerDown = true;
		document.addEventListener('pointerup', () => {
			t.pointerDown = false;
		}, { once: true });
	});

	document.addEventListener('focusin', (event) => {
		const el = triggerOf(event.target);
		if (!el || el !== event.target || !inSidebar(el) || tipOf(el).pointerDown) return;
		open(el, false);
	});

	document.addEventListener('focusout', (event) => {
		const el = triggerOf(event.target);
		if (el && el === event.target) close(el);
	});

	document.addEventListener('click', (event) => {
		const el = triggerOf(event.target);
		if (el) close(el);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeAll();
	});

	addEventListener('scroll', (event) => {
		const at = event.target;
		for (const [el, t] of tips) if (t.open && at instanceof Node && at.contains(el)) close(el);
	}, { capture: true });
})();
