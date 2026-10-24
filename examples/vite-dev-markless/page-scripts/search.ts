// The docs' local search (VitePress VPLocalSearchBox), opened from the header: same markup, index, keys and storage.
import { createFocusTrap, type FocusTrap } from 'focus-trap';
import Mark from 'mark.js/src/vanilla.js';
import MiniSearch, { type SearchResult } from 'minisearch';
import { SEARCH_SHELL } from './search-shell.ts';

interface Result {
	title: string;
	titles: string[];
	text?: string;
}
type Hit = SearchResult & Result;

const SCOPE = 'data-v-3152bd42';
const FILTER_KEY = 'vitepress:local-search-filter';
const DETAILED_KEY = 'vitepress:local-search-detailed-list';

let index: Promise<MiniSearch<Result>> | undefined;
let open = false;

function loadIndex(): Promise<MiniSearch<Result>> {
	// A module, as VitePress ships it, so opening search requests a script rather than an API call.
	index ??= import('./search-index.ts').then(({ default: json }) =>
			MiniSearch.loadJSON<Result>(json, {
				fields: ['title', 'titles', 'text'],
				storeFields: ['title', 'titles'],
				searchOptions: {
					fuzzy: 0.2,
					prefix: true,
					boost: { title: 4, text: 2, titles: 1 },
					// Vite's docs config: prefer guide pages, then config pages, and leave blog posts out.
					boostDocument(page: string) {
						if (page.startsWith('/guide/')) return 2;
						if (page.startsWith('/config/')) return 1.5;
						if (page.startsWith('/blog/')) return 0;
						return 1;
					},
				},
			}),
		);
	return index;
}

function h(tag: string, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElement {
	const el = document.createElement(tag);
	el.setAttribute(SCOPE, '');
	for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
	el.append(...children);
	return el;
}

const icon = (name: string) => h('span', { class: `${name} local-search-icon` });
const escapeRegExp = (text: string) => text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

const excerpts = new Map<string, Map<string, string>>();

// VitePress mounts each page's compiled component to read the HTML after each heading; the rendered page has the same HTML.
async function excerptMap(page: string): Promise<Map<string, string>> {
	const cached = excerpts.get(page);
	if (cached) return cached;
	const map = new Map<string, string>();
	excerpts.set(page, map);
	if (excerpts.size > 16) excerpts.delete(excerpts.keys().next().value!);
	try {
		const html = await (await fetch(page)).text();
		const doc = new DOMParser().parseFromString(html, 'text/html');
		for (const heading of doc.querySelectorAll('.vp-doc h1, .vp-doc h2, .vp-doc h3, .vp-doc h4, .vp-doc h5, .vp-doc h6')) {
			const href = heading.querySelector('a')?.getAttribute('href');
			const anchor = href?.startsWith('#') && href.slice(1);
			if (!anchor) continue;
			let text = '';
			let el: Element | null = heading;
			while ((el = el.nextElementSibling) && !/^h[1-6]$/i.test(el.tagName)) text += el.outerHTML;
			map.set(anchor, text);
		}
	} catch (error) {
		console.error(error);
	}
	return map;
}

export function preloadIndex(): void {
	void loadIndex();
}

export function openSearch(): void {
	if (open) return;
	open = true;

	let filterText = sessionStorage.getItem(FILTER_KEY) ?? '';
	let detailed = localStorage.getItem(DETAILED_KEY) === 'true';
	// VitePress keeps both choices with useStorage, which writes the defaults as soon as the box opens.
	sessionStorage.setItem(FILTER_KEY, filterText);
	localStorage.setItem(DETAILED_KEY, String(detailed));
	let results: Hit[] = [];
	let selectedIndex = -1;
	let disableMouseOver = true;
	let enableNoResults = false;
	let search: MiniSearch<Result> | undefined;
	let timer: number | undefined;
	let run = 0;
	let trap: FocusTrap | undefined;

	// A click before this module arrived drew the same box; it is replaced in place, in one task.
	const early = document.querySelector<HTMLElement>('.VPLocalSearchBox[data-mm-overflow]');
	const previousOverflow = early ? (early.getAttribute('data-mm-overflow') ?? '') : document.body.style.overflow;
	const template = document.createElement('template');
	template.innerHTML = SEARCH_SHELL;
	const root = template.content.firstElementChild as HTMLElement;
	const backdrop = root.querySelector<HTMLElement>(':scope > .backdrop')!;
	const shell = root.querySelector<HTMLElement>(':scope > .shell')!;
	const close = shell.querySelector<HTMLElement>('.search-loading-close')!;

	const input = h('input', {
		'aria-autocomplete': 'both',
		'aria-labelledby': 'localsearch-label',
		autocapitalize: 'off',
		autocomplete: 'off',
		autocorrect: 'off',
		class: 'search-input',
		id: 'localsearch-input',
		enterkeyhint: 'go',
		maxlength: '64',
		placeholder: 'Search',
		spellcheck: 'false',
		type: 'search',
	}) as HTMLInputElement;
	const back = h('button', { class: 'back-button', title: 'Close search' }, [icon('vpi-arrow-left')]);
	const toggle = h('button', { class: 'toggle-layout-button', type: 'button', title: 'Display detailed list' }, [icon('vpi-layout-list')]);
	const reset = h('button', { class: 'clear-button', type: 'reset', title: 'Reset search' }, [icon('vpi-delete')]) as HTMLButtonElement;
	const form = h('form', { class: 'search-bar' }, [
		h('label', { title: 'Search', id: 'localsearch-label', for: 'localsearch-input' }, [h('span', { 'aria-hidden': 'true', class: 'vpi-search search-icon local-search-icon' })]),
		h('div', { class: 'search-actions before' }, [back]),
		input,
		h('div', { class: 'search-actions' }, [toggle, reset]),
	]);
	const list = h('ul', { class: 'results' });
	const kbd = (label: string, child: Node | string) => h('kbd', { 'aria-label': label }, [child]);
	const footer = h('div', { class: 'search-keyboard-shortcuts' }, [
		h('span', {}, [kbd('up arrow', h('span', { class: 'vpi-arrow-up navigate-icon' })), kbd('down arrow', h('span', { class: 'vpi-arrow-down navigate-icon' })), ' to navigate']),
		h('span', {}, [kbd('enter', h('span', { class: 'vpi-corner-down-left navigate-icon' })), ' to select']),
		h('span', {}, [kbd('escape', 'esc'), ' to close']),
	]);
	const mark = new Mark(list);

	const setAttr = (el: Element, name: string, value: string | undefined) => (value === undefined ? el.removeAttribute(name) : el.setAttribute(name, value));

	function syncState(): void {
		reset.disabled = filterText.length <= 0;
		toggle.classList.toggle('detailed-list', detailed);
		setAttr(input, 'aria-activedescendant', selectedIndex > -1 ? `localsearch-item-${selectedIndex}` : undefined);
		setAttr(input, 'aria-controls', results.length ? 'localsearch-list' : undefined);
		setAttr(root, 'aria-owns', results.length ? 'localsearch-list' : undefined);
		setAttr(list, 'id', results.length ? 'localsearch-list' : undefined);
		setAttr(list, 'role', results.length ? 'listbox' : undefined);
		setAttr(list, 'aria-labelledby', results.length ? 'localsearch-label' : undefined);
		list.querySelectorAll('li[role=option]').forEach((li, i) => {
			li.setAttribute('aria-selected', selectedIndex === i ? 'true' : 'false');
			li.firstElementChild!.classList.toggle('selected', selectedIndex === i);
		});
	}

	function renderResults(): void {
		list.replaceChildren(
			...results.map((p, i) => {
				const titles = h('div', { class: 'titles' }, [h('span', { class: 'title-icon' }, ['#'])]);
				for (const t of p.titles) {
					const text = h('span', { class: 'text' });
					text.innerHTML = t;
					titles.append(h('span', { class: 'title' }, [text, icon('vpi-chevron-right')]));
				}
				const main = h('span', { class: 'text' });
				main.innerHTML = p.title;
				titles.append(h('span', { class: 'title main' }, [main]));
				const body = h('div', {}, [titles]);
				if (detailed) {
					const wrapper = h('div', { class: 'excerpt-wrapper' });
					if (p.text) {
						const doc = h('div', { class: 'vp-doc' });
						doc.innerHTML = p.text;
						wrapper.append(h('div', { class: 'excerpt', inert: '' }, [doc]));
					}
					wrapper.append(h('div', { class: 'excerpt-gradient-bottom' }), h('div', { class: 'excerpt-gradient-top' }));
					body.append(wrapper);
				}
				const a = h('a', { href: p.id, class: 'result', 'aria-label': [...p.titles, p.title].join(' > '), 'data-index': String(i) }, [body]);
				a.addEventListener('mouseenter', () => {
					if (!disableMouseOver) select(i);
				});
				a.addEventListener('focusin', () => select(i));
				a.addEventListener('click', () => closeSearch());
				return h('li', { id: `localsearch-item-${i}`, 'aria-selected': 'false', role: 'option' }, [a]);
			}),
		);
		if (filterText && !results.length && enableNoResults) {
			list.append(h('li', { class: 'no-results' }, ['No results for "', h('strong', {}, [filterText]), '"']));
		}
		syncState();
	}

	function select(i: number): void {
		selectedIndex = i;
		syncState();
	}

	function scrollToSelected(): void {
		requestAnimationFrame(() => document.querySelector('.result.selected')?.scrollIntoView({ block: 'nearest' }));
	}

	async function runSearch(): Promise<void> {
		const current = ++run;
		if (!search) return;
		results = search.search(filterText).slice(0, 16) as Hit[];
		enableNoResults = true;
		if (detailed) {
			const maps = await Promise.all(results.map((r) => excerptMap(r.id.slice(0, r.id.indexOf('#')))));
			if (current !== run) return;
			results = results.map((r, i) => ({ ...r, text: maps[i]!.get(r.id.split('#')[1]!) ?? '' }));
		}
		selectedIndex = results.length ? 0 : -1;
		renderResults();
		scrollToSelected();
		const terms = new Set<string>();
		for (const r of results) for (const term in r.match) terms.add(term);
		await new Promise<void>((done) =>
			mark.unmark({
				done: () =>
					terms.size
						? mark.markRegExp(
								new RegExp(
									[...terms]
										.sort((a, b) => b.length - a.length)
										.map((term) => `(${escapeRegExp(term)})`)
										.join('|'),
									'gi',
								),
								{ done: () => done() },
							)
						: done(),
			}),
		);
		for (const excerpt of root.querySelectorAll('.result .excerpt')) excerpt.querySelector('mark[data-markjs="true"]')?.scrollIntoView({ block: 'center' });
		list.firstElementChild?.scrollIntoView({ block: 'start' });
	}

	const schedule = () => {
		clearTimeout(timer);
		timer = window.setTimeout(() => void runSearch(), 200);
	};

	const focusInput = (selectText = true) => {
		input.focus();
		if (selectText) input.select();
	};

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			const step = event.key === 'ArrowUp' ? -1 : 1;
			selectedIndex = results.length ? (selectedIndex + step + results.length) % results.length : -1;
			disableMouseOver = true;
			syncState();
			scrollToSelected();
		} else if (event.key === 'Enter') {
			if (event.isComposing) return;
			if (event.target instanceof HTMLButtonElement && event.target.type !== 'submit') return;
			const selected = results[selectedIndex];
			if (event.target instanceof HTMLInputElement && !selected) {
				event.preventDefault();
				return;
			}
			if (selected) {
				closeSearch();
				location.assign(selected.id);
			}
		} else if (event.key === 'Escape') {
			closeSearch();
		}
	}

	const onPopstate = (event: PopStateEvent) => {
		event.preventDefault();
		closeSearch();
	};

	function closeSearch(): void {
		if (!open) return;
		open = false;
		trap?.deactivate();
		clearTimeout(timer);
		window.removeEventListener('keydown', onKeydown);
		window.removeEventListener('popstate', onPopstate);
		document.body.style.overflow = previousOverflow;
		root.remove();
	}

	close.addEventListener('click', closeSearch);
	backdrop.addEventListener('click', closeSearch);
	back.addEventListener('click', closeSearch);
	form.addEventListener('submit', (event) => event.preventDefault());
	form.addEventListener('pointerup', (event) => {
		if (event.pointerType === 'mouse') focusInput();
	});
	input.value = filterText;
	input.addEventListener('input', () => {
		filterText = input.value;
		sessionStorage.setItem(FILTER_KEY, filterText);
		enableNoResults = false;
		syncState();
		schedule();
	});
	toggle.addEventListener('click', () => {
		if (selectedIndex <= -1) return;
		detailed = !detailed;
		localStorage.setItem(DETAILED_KEY, String(detailed));
		syncState();
		schedule();
	});
	reset.addEventListener('click', () => {
		filterText = '';
		input.value = '';
		sessionStorage.setItem(FILTER_KEY, '');
		syncState();
		schedule();
		requestAnimationFrame(() => focusInput(false));
	});
	list.addEventListener('mousemove', (event) => {
		if (!disableMouseOver) return;
		const el = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.result');
		const i = Number.parseInt(el?.dataset.index ?? '');
		if (i >= 0 && i !== selectedIndex) select(i);
		disableMouseOver = false;
	});

	if (early) early.replaceWith(root);
	else document.body.append(root);
	history.pushState(null, '', null);
	window.addEventListener('popstate', onPopstate);
	window.addEventListener('keydown', onKeydown);
	document.body.style.overflow = 'hidden';
	trap = createFocusTrap(root, { allowOutsideClick: true, clickOutsideDeactivates: true, escapeDeactivates: true, fallbackFocus: () => root, onDeactivate: () => closeSearch() });

	void loadIndex().then((loaded) => {
		if (!open) return;
		search = loaded;
		shell.replaceChildren(form, list, footer);
		syncState();
		trap?.activate();
		focusInput();
		void runSearch();
	});
}
