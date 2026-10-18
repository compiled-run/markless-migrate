// The showcase page's filters (src/pages/showcase): tags, the OR/AND operator and the name search live in the query
// string, replaced on every change; the cards, the count and the sections follow them.
import tagKeys from './showcase-tags.json';

type Card = { li: HTMLElement; title: string; tags: string[] };
type Showcase = { shown: string; cards: Card[]; section: HTMLElement; full: Node[]; lists: { ul: HTMLElement; cards: HTMLElement[] }[]; tagInputs: HTMLInputElement[]; operator: HTMLInputElement | null; count: HTMLElement | null; search: HTMLInputElement | null };

let current: Showcase | undefined;

function state() {
	const params = new URLSearchParams(location.search);
	return { tags: params.getAll('tags'), operator: params.get('operator') === 'AND' ? 'AND' : 'OR', name: params.get('name') ?? '' };
}
function replaceSearch(params: URLSearchParams | undefined): void {
	const search = params?.toString() ?? '';
	history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}`);
	if (current) render(current);
}
function update(change: (params: URLSearchParams) => void): void {
	const params = new URLSearchParams(location.search);
	change(params);
	replaceSearch(params);
}

function render(s: Showcase): void {
	const { tags, operator, name } = state();
	s.tagInputs.forEach((input, i) => (input.checked = tags.includes(tagKeys[i]!)));
	if (s.operator) s.operator.checked = operator === 'AND';
	if (s.search) {
		if (s.search.value !== name) s.search.value = name;
		if (s.search.defaultValue !== name || !s.search.hasAttribute('value')) s.search.defaultValue = name;
	}
	let users = name ? s.cards.filter((card) => card.title.toLowerCase().includes(name.toLowerCase())) : s.cards;
	if (tags.length) users = users.filter((card) => card.tags.length > 0 && (operator === 'AND' ? tags.every((t) => card.tags.includes(t)) : tags.some((t) => card.tags.includes(t))));
	const count = users.length === 1 ? '1 site' : `${users.length} sites`;
	if (s.count && s.count.textContent !== count) s.count.textContent = count;
	const shown = users.length === s.cards.length ? 'all' : users.map((card) => card.title).join('\n');
	if (shown === s.shown) return;
	s.shown = shown;
	renderCards(s, users);
	// What React mounts after the first render carries styles as the browser writes them back.
	for (const el of s.section.querySelectorAll<HTMLElement>('[style]')) el.setAttribute('style', el.style.cssText);
}
function renderCards(s: Showcase, users: Card[]): void {
	if (users.length === 0) {
		const box = document.createElement('div');
		box.className = 'container padding-vert--md text--center';
		const heading = document.createElement('h2');
		heading.textContent = 'No result';
		box.append(heading);
		s.section.replaceChildren(box);
	} else if (users.length === s.cards.length) {
		for (const list of s.lists) list.ul.replaceChildren(...list.cards);
		s.section.replaceChildren(...s.full);
	} else {
		const box = document.createElement('div');
		box.className = 'container';
		const ul = document.createElement('ul');
		ul.className = s.lists[0]?.ul.className ?? 'clean-list';
		ul.append(...users.map((card) => card.li));
		box.append(ul);
		s.section.replaceChildren(box);
	}
}

/** Wires the showcase filters when the page has them. */
let listening = false;
export function initShowcase(): void {
	if (!listening) {
		listening = true;
		window.addEventListener('popstate', () => current?.section.isConnected && render(current));
	}
	const filters = document.querySelector<HTMLElement>('main > section.container.margin-top--l.margin-bottom--lg');
	const section = document.querySelector<HTMLElement>('main > section.margin-top--lg.margin-bottom--xl');
	const tagList = filters?.querySelector(':scope > ul.clean-list');
	if (!filters || !section || !tagList) {
		current = undefined;
		return;
	}
	if (current?.section === section) return render(current);
	const labels = [...tagList.querySelectorAll(':scope > li > label')];
	const tagByDescription = new Map(labels.map((label, i) => [label.getAttribute('title') ?? '', tagKeys[i]!]));
	const lists = [...section.querySelectorAll<HTMLElement>(':scope > div ul.clean-list')].map((ul) => ({ ul, cards: [...ul.querySelectorAll<HTMLElement>(':scope > li.card')] }));
	const cards = lists.flatMap((list) =>
		list.cards.map((li) => ({
			li,
			title: li.querySelector('.card__body h4 a')?.textContent ?? '',
			tags: [...li.querySelectorAll(':scope > ul.card__footer > li')].map((tag) => tagByDescription.get(tag.getAttribute('title') ?? '')).filter((tag): tag is string => Boolean(tag)),
		})),
	);
	const s: Showcase = {
		shown: 'all',
		cards,
		section,
		full: [...section.childNodes],
		lists,
		tagInputs: [...tagList.querySelectorAll<HTMLInputElement>(':scope > li > input[type=checkbox]')],
		operator: filters.querySelector<HTMLInputElement>(':scope > div input[type=checkbox]'),
		count: filters.querySelector<HTMLElement>(':scope > div > div > span'),
		search: document.querySelector<HTMLInputElement>('main > div.container input'),
	};
	current = s;
	s.tagInputs.forEach((input, i) => {
		const toggle = () => update((params) => {
			const list = params.getAll('tags');
			const tag = tagKeys[i]!;
			params.delete('tags');
			for (const value of list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]) params.append('tags', value);
		});
		input.addEventListener('change', toggle);
		input.addEventListener('keydown', (event) => event.key === 'Enter' && toggle());
	});
	const toggleOperator = () => update((params) => (state().operator === 'OR' ? params.set('operator', 'AND') : params.delete('operator')));
	s.operator?.addEventListener('change', toggleOperator);
	s.operator?.addEventListener('keydown', (event) => event.key === 'Enter' && toggleOperator());
	s.search?.addEventListener('input', () => update((params) => (s.search!.value ? params.set('name', s.search!.value) : params.delete('name'))));
	filters.querySelector(':scope > div button')?.addEventListener('click', () => replaceSearch(undefined));
	render(s);
}

