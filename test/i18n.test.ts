import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formats, negotiationFailures } from '../src/check/i18n.ts';

const shapes = (line: string, lang: string) => formats([line], [lang]).map((f) => f.shape);

test('dates and numbers are reduced to the shape their locale formatting gives them', () => {
	assert.deepEqual(shapes('Next roast: 27 October 2026 · Sack: €1,234.50', 'en-GB'), ['# MMMM #', '€#,#.#']);
	assert.deepEqual(shapes('Prochaine : 27 octobre 2026 · Sac : 1 234,50 €', 'fr'), ['# MMMM #', '# #,# €']);
	assert.deepEqual(shapes('Prochaine : October 27, 2026', 'fr'), ['MMMM #, #'], 'an English date on a French page is still read');
	assert.deepEqual(shapes('التالي: ٢٧ أكتوبر ٢٠٢٦ · ١٬٢٣٤٫٥٠ €', 'ar'), ['٠ MMMM ٠', '٠٬٠٫٠ €']);
	assert.deepEqual(shapes('Rendered at 2026-10-16T05:47:57.922Z', 'en'), ['#-#-#T#:#:#.#Z']);
	assert.deepEqual(shapes('Routes from 4 km to 19 km, groups of up to 12', 'en'), []);
});

test('where OLD sends each Accept-Language to a different page, NEW must send it to the same one', () => {
	const old = { en: '/en', fr: '/fr' };
	assert.deepEqual(negotiationFailures('/', ['en', 'fr'], [old, old], old), []);
	const [f, ...rest] = negotiationFailures('/', ['en', 'fr'], [old, old], { en: '/en', fr: '/en' });
	assert.equal(rest.length, 0);
	assert.equal(f!.check, 'page a browser sending Accept-Language: fr lands on');
	assert.equal(f!.actual, '/en');
	assert.deepEqual(negotiationFailures('/', ['en', 'fr'], [old, { ...old, fr: '/en' }], { en: '/en', fr: 'x' }), [], 'OLD itself was not consistent');
	assert.deepEqual(negotiationFailures('/missing', ['en', 'fr'], [{ en: '/missing', fr: '/missing' }], { en: '/x', fr: '/x' }), [], 'OLD does not negotiate here');
});
