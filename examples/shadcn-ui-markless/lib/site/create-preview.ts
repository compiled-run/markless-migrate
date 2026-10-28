import { DESIGN_SYSTEM_MESSAGE, DESIGN_SYSTEM_READY } from './create-messages.ts';
import { parseParams, previewDesign, radiusFix, setParamsUpdate, updateSearch, type CreateParams, type CreateUpdate } from './create-params.ts';

// app/(app)/(create)/components/design-system-provider.tsx in the page /create shows in its iframe: the params (its URL's,
// then each the designer posts, written back to its own URL in place) as the style and base color classes on <body>,
// the fonts on <html>, the theme's CSS variables in a <style>, and the menu color on every menu.

const THEME_STYLE_ELEMENT_ID = 'design-system-theme-vars';
const MANAGED_BODY_CLASS_PREFIXES = ['style-', 'base-color-'];

const themeStyle = document.createElement('style');
themeStyle.id = THEME_STYLE_ELEMENT_ID;

let menuColor: { inverted: boolean; translucent: boolean } | null = null;

function updateMenuElements(): void {
	if (!menuColor) return;
	const all = document.querySelectorAll<HTMLElement>('.cn-menu-target, [data-menu-translucent]');
	if (all.length === 0) return;
	// Transitions off while the classes change, back on after a reflow.
	for (const el of all) el.style.transition = 'none';
	for (const el of all) {
		if (el.classList.contains('cn-menu-target')) el.classList.toggle('dark', menuColor.inverted);
		if (menuColor.translucent) {
			el.classList.add('cn-menu-translucent');
			el.removeAttribute('data-menu-translucent');
		} else if (el.classList.contains('cn-menu-translucent')) {
			el.classList.remove('cn-menu-translucent');
			el.setAttribute('data-menu-translucent', '');
		}
	}
	void document.body.offsetHeight;
	for (const el of all) el.style.transition = '';
}

function apply(params: CreateParams): void {
	const design = previewDesign(params);
	const body = document.body;
	for (const name of [...body.classList]) if (MANAGED_BODY_CLASS_PREFIXES.some((p) => name.startsWith(p))) body.classList.remove(name);
	body.classList.add(...design.bodyClasses);
	const root = document.documentElement.style;
	if (design.fontSans) root.setProperty('--font-sans', design.fontSans);
	if (design.fontHeading) root.setProperty('--font-heading', design.fontHeading);
	if (!themeStyle.isConnected) document.head.appendChild(themeStyle);
	themeStyle.replaceChildren(design.themeCss);
	menuColor = { inverted: design.menuInverted, translucent: design.menuTranslucent };
	updateMenuElements();
}

/** setSearchParams with history "replace": the iframe's own URL takes the update, and the design follows. */
function set(update: CreateUpdate): void {
	const search = updateSearch(location.search, setParamsUpdate(parseParams(location.search), update));
	if (search !== location.search) history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
	const params = parseParams(location.search);
	const fix = radiusFix(params);
	if (fix) return set(fix);
	apply(params);
}

/** Starts the provider on a preview page: once, whatever the page's idle work runs again. */
let started = false;
export function startPreview(): void {
	if (started) return;
	started = true;
	set({});
	// The preview is a page of its own too: only a page in a frame listens to the designer.
	if (window.self !== window.top) {
		window.addEventListener('message', (event) => {
			const data = event.data as { type?: unknown; data?: CreateUpdate } | null;
			if (data && typeof data === 'object' && data.type === DESIGN_SYSTEM_MESSAGE && data.data) set(data.data);
		});
		window.parent.postMessage({ type: DESIGN_SYSTEM_READY }, '*');
	}
	let frame = 0;
	new MutationObserver(() => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			updateMenuElements();
		});
	}).observe(document.body, { childList: true, subtree: true });
	// PreventScrollOnFocusScript: focusing an element in the preview never scrolls it.
	const focus = HTMLElement.prototype.focus;
	HTMLElement.prototype.focus = function (options?: FocusOptions) {
		focus.call(this, { ...options, preventScroll: true });
	};
}
