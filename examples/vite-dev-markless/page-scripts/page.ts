// Every page's module script: VitePress's client behaviour for the whole site, the docs layout's, and the homepage's
// Rive animations from their own module, loaded only where a page has them.
import { onPage } from './site.ts';
import './docs.ts';
import './live.ts';

onPage(() => {
	if (document.querySelector('.marketing-layout canvas[data-rive]')) void import(/* @vite-ignore */ '/page-scripts/home.js');
});
