// The docs layout's header (@voidzero-dev/vitepress-theme's oss/Header.vue with VPFlyout.vue): flyouts open while the
// pointer is over them, on a click and until focus leaves; the mobile menu mounts on the toggle, locks the page's scroll,
// traps focus, and unmounts on close, Escape or a followed link; the banner's close button dismisses it for good.
// The docs layout's header, and the marketing layout's on pages ported from Markdown (/live); the homepage keeps its own.
const HEADER = '[data-v-5773249e].relative.w-full.z-50:has(> template[data-mobile-menu])';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const flyoutOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(`${HEADER} .VPFlyout`) : null);
const setOpen = (flyout: HTMLElement, open: boolean) => flyout.querySelector(':scope > button')?.setAttribute('aria-expanded', String(open));

document.addEventListener('mouseover', (event) => {
	const flyout = flyoutOf(event.target);
	if (flyout && !flyout.contains(event.relatedTarget as Node | null)) setOpen(flyout, true);
});
document.addEventListener('mouseout', (event) => {
	const flyout = flyoutOf(event.target);
	if (flyout && !flyout.contains(event.relatedTarget as Node | null)) setOpen(flyout, false);
});
document.addEventListener('focusin', () => {
	for (const flyout of document.querySelectorAll<HTMLElement>(`${HEADER} .VPFlyout`)) if (!flyout.contains(document.activeElement)) setOpen(flyout, false);
});

// Header.vue's lockBodyScroll and focus trap.
function lockBodyScroll(): void {
	const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	const style = document.body.style;
	style.overflow = 'hidden';
	style.position = 'fixed';
	style.width = '100%';
	style.top = '0';
	if (scrollbarWidth > 0) style.paddingRight = `${scrollbarWidth}px`;
}
function unlockBodyScroll(): void {
	const style = document.body.style;
	style.overflow = '';
	style.position = '';
	style.width = '';
	style.top = '';
	style.paddingRight = '';
}
let trap: ((event: KeyboardEvent) => void) | undefined;
let hamburger: Element[] = [];

const header = () => document.querySelector<HTMLElement>(HEADER);
const toggle = () => header()?.querySelector<HTMLElement>('button[aria-controls="mobile-menu"]');

function openMenu(): void {
	const root = header();
	const template = root?.querySelector<HTMLTemplateElement>('template[data-mobile-menu]');
	const button = toggle();
	if (!root || !template || !button || document.getElementById('mobile-menu')) return;
	button.setAttribute('aria-expanded', 'true');
	hamburger = [...button.children];
	for (const icon of hamburger) icon.remove();
	template.before(template.content.cloneNode(true));
	lockBodyScroll();
	document.dispatchEvent(new CustomEvent('docs:mobilemenu'));
	requestAnimationFrame(() => {
		const menu = document.getElementById('mobile-menu');
		const focusable = menu ? [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		first.focus();
		trap = (event) => {
			if (event.key !== 'Tab') return;
			if (event.shiftKey && document.activeElement === first) {
				last.focus();
				event.preventDefault();
			} else if (!event.shiftKey && document.activeElement === last) {
				first.focus();
				event.preventDefault();
			}
		};
		document.addEventListener('keydown', trap);
	});
}
function closeMenu(): void {
	const menu = document.getElementById('mobile-menu');
	if (!menu || !menu.closest(HEADER)) return;
	menu.remove();
	const button = toggle();
	button?.setAttribute('aria-expanded', 'false');
	button?.append(...hamburger);
	hamburger = [];
	unlockBodyScroll();
	if (trap) document.removeEventListener('keydown', trap);
	trap = undefined;
}

document.addEventListener('click', (event) => {
	const target = event.target as Element | null;
	if (!target?.closest?.(HEADER)) {
		if (target?.closest?.('.top-banner button[aria-label="Close banner"]') && document.querySelector(HEADER)) {
			document.documentElement.classList.add('banner-dismissed');
			localStorage.setItem('banner-dismissed-viteconf-2026', 'true');
		}
		return;
	}
	const flyoutButton = target.closest<HTMLElement>('.VPFlyout > button');
	if (flyoutButton) {
		setOpen(flyoutButton.parentElement!, flyoutButton.getAttribute('aria-expanded') !== 'true');
		return;
	}
	if (target.closest('button[aria-controls="mobile-menu"]')) {
		if (document.getElementById('mobile-menu')) closeMenu();
		else openMenu();
		return;
	}
	const menu = target.closest('#mobile-menu');
	if (!menu) return;
	// Header.vue's drawer logo has no close handler: on the page it links to, the drawer stays open.
	const logo = target.closest<HTMLAnchorElement>('#mobile-menu > section > div:first-child > a[href]');
	if (logo && new URL(logo.href).pathname === location.pathname) return;
	if (target.closest('button[aria-label="Close navigation menu"]') || target.closest('a[href]')) {
		closeMenu();
		return;
	}
	const accordion = target.closest<HTMLElement>('button[aria-expanded]');
	if (!accordion) return;
	const open = accordion.getAttribute('aria-expanded') !== 'true';
	accordion.setAttribute('aria-expanded', String(open));
	accordion.querySelector('svg')?.classList.toggle('rotate-180', open);
	const list = accordion.nextElementSibling as HTMLElement | null;
	if (list) list.style.display = open ? '' : 'none';
});
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') closeMenu();
});
// A followed link replaces the page under an open menu; the body it locked stays.
document.addEventListener('marklessrouterrendered', () => {
	if (!trap && !hamburger.length) return;
	unlockBodyScroll();
	if (trap) document.removeEventListener('keydown', trap);
	trap = undefined;
	hamburger = [];
});
