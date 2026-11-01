import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markCompositions, PART_MARK, type CompositionFact } from '../src/convert/compositions.ts';
import { attr, body, parseDocument, textContent, walk } from '../src/convert/dom.ts';

// What plan's inventory records for shadcn's sheet demos: the radix sheet-demo's footer Close, new-york's sheet-side
// footer "Save changes" (a SheetClose there, a plain submit button in sheet-demo) and the sheet's own corner X.
const FACTS: CompositionFact[] = [
	{ part: 'dialog-close', slots: ['sheet-close', 'button'], text: 'Close', within: 'sheet-footer', siblings: ['Save changes', 'Close'], index: 1 },
	{ part: 'dialog-close', slots: ['sheet-close', 'button'], text: 'Save changes', within: 'sheet-footer', siblings: ['Save changes'], index: 0 },
	{ part: 'dialog-close', slots: ['sheet-close', 'button'], text: 'Close', within: 'sheet-content' },
	{ part: 'dialog-trigger', slots: ['sheet-trigger', 'button'], text: 'Open', within: 'sheet', siblings: ['Open', 'Edit profile'], index: 0 },
];

const SHEET = `<main><button data-slot="button" aria-haspopup="dialog">Open</button><button data-slot="button">Close</button></main>
<div role="dialog" data-slot="sheet-content"><div data-slot="sheet-header"><h2>Edit profile</h2></div>
<div data-slot="sheet-footer"><button data-slot="button" type="submit">Save changes</button><button data-slot="button">Close</button></div>
<button data-slot="sheet-close"><span class="sr-only">Close</span></button></div>`;

const marks = (html: string, facts = FACTS) => {
	const root = body(parseDocument(html));
	markCompositions([root], facts);
	return [...walk(root)].filter((el) => attr(el, PART_MARK)).map((el) => `${attr(el, 'data-slot')} ${textContent(el).trim()} ${attr(el, PART_MARK)}`);
};

test('a part the source renders through its child is marked with its role where the page shows its element', () => {
	assert.deepEqual(marks(SHEET), ['button Close dialog-close', 'sheet-close Close dialog-close']);
});

test('a site is not marked outside the element the source puts it in, or out of the row the source fixes', () => {
	// The page's own "Close" outside any sheet, and sheet-demo's plain "Save changes" (sheet-side's row has it alone), stay unmarked.
	const marked = marks(SHEET);
	assert.ok(!marked.some((m) => m.startsWith('button Save changes')));
	assert.equal(marked.filter((m) => m === 'button Close dialog-close').length, 1);
	assert.deepEqual(marks('<div data-slot="sheet-footer"><button data-slot="button">Close</button></div><p data-slot="sheet-footer"></p>', [FACTS[0]!]), []);
});

test('a site with neither text nor label the source fixes is never marked by its slot alone', () => {
	assert.deepEqual(marks('<div data-slot="sheet-footer"><button data-slot="button">Close</button></div>', [{ part: 'dialog-close', slots: ['button'] }]), []);
	assert.deepEqual(marks('<div data-slot="popover-content"><button aria-label="Dismiss"></button></div>', [{ part: 'popover-close', slots: [], label: 'Dismiss', within: 'popover-content' }]), ['undefined  popover-close']);
});

test('a site whose surroundings the page never shows marks nothing, and a site in its row outranks one only in its element', () => {
	const drawer: CompositionFact = { part: 'drawer-close', slots: ['drawer-close', 'button'], text: 'Cancel', within: 'drawer-footer' };
	const sheet: CompositionFact = { part: 'dialog-close', slots: ['sheet-close', 'button'], text: 'Cancel', within: 'sheet-footer', siblings: ['Save changes', 'Cancel'], index: 1 };
	const loose: CompositionFact = { part: 'alert-dialog-cancel', slots: ['button'], text: 'Cancel', within: 'sheet-footer' };
	const html = '<div data-slot="sheet-footer"><button data-slot="button">Save changes</button><button data-slot="button">Cancel</button></div>';
	assert.deepEqual(marks(html, [drawer]), []);
	assert.deepEqual(marks(html, [drawer, loose, sheet]), ['button Cancel dialog-close']);
	assert.deepEqual(marks('<main><button data-slot="button">Open</button></main>', [FACTS[3]!]), []);
});

test('an element two parts\' sites fit equally well is left unmarked', () => {
	const sheet: CompositionFact = { part: 'dialog-trigger', slots: ['button'], text: 'Open', within: 'field' };
	const menu: CompositionFact = { part: 'menu-trigger', slots: ['button'], text: 'Open', within: 'field' };
	const html = '<div data-slot="field"><button data-slot="button">Open</button></div>';
	assert.deepEqual(marks(html, [sheet, menu]), []);
	assert.deepEqual(marks(html, [sheet, { ...sheet, text: 'Open' }]), ['button Open dialog-trigger']);
});
