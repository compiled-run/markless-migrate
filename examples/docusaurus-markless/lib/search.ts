// The search modal: DocSearch's own vanilla build (the same DocSearch 4.7 that docusaurus.io renders through React),
// loaded only when someone opens search, with the old site's Algolia settings.
import docsearch from '@docsearch/js';
import translations from './search-translations.json';

type Instance = ReturnType<typeof docsearch>;
let instance: Instance | undefined;

function meta(name: string): string | undefined {
	return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined;
}

export function open(): void {
	if (instance) return;
	const tag = meta('docsearch:docusaurus_tag');
	instance = docsearch({
		container: '.navbarSearchContainer_dDCC',
		appId: 'X1Z85QJPUV',
		apiKey: 'bf7211c161e8205da2f933a02534105a',
		indexName: 'docusaurus-2',
		askAi: { assistantId: 'RgIMYFUmTfrN', indexName: 'docusaurus-markdown', suggestedQuestions: true },
		placeholder: translations.placeholder,
		translations,
		searchParameters: { facetFilters: [`language:${meta('docsearch:language') ?? 'en'}`, [tag ? `docusaurus_tag:${tag}` : 'docusaurus_tag:default', 'docusaurus_tag:default'].filter((v, i, all) => all.indexOf(v) === i)] },
	} as Parameters<typeof docsearch>[0]);
}

// Docusaurus portals the modal into a <div> it inserts as the body's first child; DocSearch's own build portals into
// the body's end. Moving the open modal there keeps the page's reading order the same.
function holder(): HTMLElement {
	let div = document.body.firstElementChild as HTMLElement | null;
	if (!div?.hasAttribute('data-docsearch-holder')) {
		div = document.createElement('div');
		div.setAttribute('data-docsearch-holder', '');
		document.body.insertBefore(div, document.body.firstChild);
	}
	return div;
}

export function show(): void {
	instance?.open();
	const move = () => {
		const modal = document.querySelector('body > .DocSearch-Container');
		if (!modal) return false;
		holder().append(modal);
		// Moving a node drops its focus; DocSearch had focused the input.
		(modal.querySelector('.DocSearch-Input') as HTMLInputElement | null)?.focus();
		return true;
	};
	if (!move()) requestAnimationFrame(() => void move());
}
