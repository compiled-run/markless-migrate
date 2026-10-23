import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attr, find, head, parseDocument, walk } from '../src/convert/dom.ts';
import { frozenCacheControl } from '../src/convert/endpoints.ts';
import { nextImageWidths, NEXT_WIDTHS, pairImages, planImages, sizesFor, type ImageFact, type ImageFacts } from '../src/convert/images.ts';

const HERO = '/_next/image?url=%2Fimages%2Flight.png&amp;w=3840&amp;q=75';
const DARK = '/_next/image?url=%2Fimages%2Fdark.png&amp;w=3840&amp;q=75';
const PAGE = `<!DOCTYPE html><html><head>
<link rel="preload" as="image" imagesrcset="${HERO} 1x"><link rel="preload" as="image" imagesrcset="${DARK} 1x">
</head><body><main>
<img alt="Dashboard" width="2560" height="2764" class="block dark:hidden" srcset="${HERO} 1x" src="${HERO}">
<img alt="Dashboard" width="2560" height="2764" class="hidden dark:block" srcset="${DARK} 1x" src="${DARK}">
<img alt="Logo" loading="lazy" src="/logo.svg">
<img alt="Footer" src="/footer.png">
</main></body></html>`;

const key = (src: string, srcset = '') => `${src.replace(/&amp;/g, '&')}|${srcset.replace(/&amp;/g, '&')}`;
const fact = (k: string, shown: boolean, top: number, width: number, widths?: Record<string, number>): ImageFact => ({ key: k, shown, top, bottom: top + 400, width, ...(widths ? { widths } : {}) });

const FACTS: Record<string, ImageFacts> = {
	desktop: {
		viewport: { width: 1280, height: 800 },
		images: [
			fact(key(HERO, `${HERO} 1x`), true, 378, 1009, { '767': 1100, '768': 700, '1279': 1008, '1920': 1009 }),
			fact(key(DARK, `${DARK} 1x`), false, 0, 0, { '767': 0, '768': 0, '1279': 0, '1920': 0 }),
			fact(key('/logo.svg'), true, 20, 32),
			fact(key('/footer.png'), true, 2400, 1280),
		],
	},
	mobile: {
		viewport: { width: 390, height: 844 },
		images: [fact(key(HERO, `${HERO} 1x`), true, 378, 577), fact(key(DARK, `${DARK} 1x`), false, 0, 0), fact(key('/logo.svg'), true, 20, 32), fact(key('/footer.png'), true, 3100, 390)],
	},
};

const imgs = (doc: ReturnType<typeof parseDocument>) => [...walk(doc)].filter((el) => el.tagName === 'img');

test('an image no first screen shows is lazy and its head preload goes; one in a first screen is never lazy', () => {
	const doc = parseDocument(PAGE);
	const dropped = new Map<string, number>();
	const plan = planImages(doc, pairImages(doc, FACTS), undefined, dropped);
	const [hero, dark, logo, footer] = imgs(doc);
	assert.equal(attr(hero!, 'loading'), undefined);
	assert.equal(attr(dark!, 'loading'), 'lazy', 'the dark-mode twin is drawn at no viewport');
	assert.equal(attr(logo!, 'loading'), undefined, 'a lazy image in the first screen is made eager');
	assert.equal(attr(footer!, 'loading'), 'lazy', 'below the fold at both viewports');
	const preloads = [...walk(head(doc))].filter((el) => el.tagName === 'link');
	assert.deepEqual(
		preloads.map((l) => attr(l, 'imagesrcset')),
		[`${HERO.replace(/&amp;/g, '&')} 1x`],
	);
	assert.deepEqual({ ...plan }, { lazy: 2, eager: 1, responsive: 0, preloadsDropped: 1, someScreens: 0 });
	assert.equal([...dropped.values()][0], 1);
});

test('a fixed-width optimizer image gets the widths it answers up to its own and the sizes its boxes need; its preload follows', () => {
	const doc = parseDocument(PAGE);
	const plan = planImages(doc, pairImages(doc, FACTS), { path: '/_next/image', widths: NEXT_WIDTHS }, new Map());
	const hero = imgs(doc)[0]!;
	const srcset = attr(hero, 'srcset')!;
	assert.deepEqual(
		srcset.split(', ').map((c) => c.split(' ')[1]),
		['640w', '750w', '828w', '1080w', '1200w', '1920w', '2048w', '3840w'],
		'from the narrowest box it is drawn in (577 px) up to its own file',
	);
	assert.match(srcset, /^\/_next\/image\?url=%2Fimages%2Flight\.png&w=640&q=75 640w, /);
	// 577 of 390 (an overflowing hero) and 1100 of 767 on phones, 700 of 768 and 1008 of 1279 between, and 1009 px from 1280 on.
	assert.equal(attr(hero, 'sizes'), '(max-width: 767px) 148vw, (max-width: 1279px) 92vw, 1009px');
	const preload = find(head(doc), (el) => el.tagName === 'link')!;
	assert.equal(attr(preload, 'imagesrcset'), srcset);
	assert.equal(attr(preload, 'imagesizes'), attr(hero, 'sizes'));
	assert.equal(plan.responsive, 1, 'the hidden twin has no box to size from and keeps its file');
});

test('a capture whose images no longer line up with the document is left alone', () => {
	const doc = parseDocument(PAGE);
	const plan = planImages(doc, pairImages(doc, { desktop: { ...FACTS.desktop!, images: FACTS.desktop!.images.slice(1) } }), undefined, new Map());
	assert.deepEqual({ ...plan }, { lazy: 0, eager: 0, responsive: 0, preloadsDropped: 0, someScreens: 0 });
	assert.equal(planImages(doc, pairImages(doc, undefined), undefined, new Map()).lazy, 0);
});

test('sizes: a share of the viewport per range, or the width itself once it stops growing', () => {
	assert.equal(sizesFor({ '390': 358, '767': 735, '768': 736, '1279': 1247, '1280': 1248, '1920': 1888 }), '(max-width: 767px) 96vw, (max-width: 1279px) 98vw, 99vw');
	assert.equal(sizesFor({ '390': 0, '767': 0, '768': 300, '1279': 300, '1280': 300, '1920': 300 }), '(max-width: 767px) 100vw, (max-width: 1279px) 40vw, 300px');
	assert.equal(sizesFor({ '390': 0, '1280': 0 }), undefined);
});

test("the optimizer's widths come from next.config when it sets them", () => {
	assert.deepEqual(nextImageWidths(undefined), NEXT_WIDTHS);
	assert.deepEqual(nextImageWidths('export default { images: { deviceSizes: [640, 1080, 2048], remotePatterns: [] } }'), [16, 32, 48, 64, 96, 128, 256, 384, 640, 1080, 2048]);
});

test('an image answered from a file written at convert time is kept by the CDN for the deployment', () => {
	assert.equal(frozenCacheControl('public, max-age=14400, must-revalidate'), 'public, max-age=14400, must-revalidate, s-maxage=31536000');
	assert.equal(frozenCacheControl(null), 'public, max-age=0, must-revalidate, s-maxage=31536000');
	assert.equal(frozenCacheControl('private, no-cache'), 'public, s-maxage=31536000');
});

test('the checker takes a smaller rendition of the same image as the same picture, never a different or a too-small one', async () => {
	const { responsiveImageCandidate, responsiveRegionsCandidate } = await import('../src/check/automatic.ts');
	const old = { src: '/_next/image?url=%2Fimages%2Flight.png&w=3840&q=75', alt: 'Dashboard', naturalWidth: 3840, naturalHeight: 4146, broken: false, box: { x: 0, y: 378, width: 577, height: 623 } };
	const next = { ...old, src: '/_next/image?url=%2Fimages%2Flight.png&w=640&q=75', naturalWidth: 640, naturalHeight: 691 };
	assert.equal(responsiveImageCandidate(old, next)?.rule, 'responsive-image');
	assert.equal(responsiveImageCandidate(old, { ...next, src: '/_next/image?url=%2Fimages%2Fdark.png&w=640&q=75' }), undefined, 'another image');
	assert.equal(responsiveImageCandidate(old, { ...next, naturalWidth: 384, naturalHeight: 415 }), undefined, 'fewer pixels than its box');
	assert.equal(responsiveImageCandidate(old, { ...next, naturalHeight: 500 }), undefined, 'another aspect ratio');
	const page = (images: (typeof old)[]) => ({ images }) as unknown as Parameters<typeof responsiveRegionsCandidate>[1];
	assert.equal(responsiveRegionsCandidate([{ x: 16, y: 400, width: 200, height: 100 }], page([old]), page([next]))?.rule, 'responsive-image');
	assert.equal(responsiveRegionsCandidate([{ x: 16, y: 100, width: 200, height: 100 }], page([old]), page([next])), undefined, 'a difference outside the image');
});

test('check: an image no first screen shows loads lazily, a first-screen one never does, and a phone gets a file near its box', async () => {
	const { imageLoadingFailures } = await import('../src/check/image-loading.ts');
	const img = (over: Record<string, unknown>) => ({ src: '/a.png', alt: 'a', naturalWidth: 800, naturalHeight: 600, broken: false, ...over });
	const pages = (desktop: object[], mobile: object[]) => ({ desktop: { viewport: 'desktop', images: desktop }, mobile: { viewport: 'mobile', images: mobile } }) as unknown as Parameters<typeof imageLoadingFailures>[1];
	const below = pages([img({ box: { x: 0, y: 2400, width: 400, height: 300 } })], [img({ box: { x: 0, y: 3100, width: 390, height: 290 } })]);
	assert.match(imageLoadingFailures('/', below)[0]!.actual, /loaded with the page; desktop drawn at y=2400, below the first 800 px, mobile drawn at y=3100/);
	const lazyBelow = pages([img({ loading: 'lazy', box: { x: 0, y: 2400, width: 400, height: 300 } })], [img({ loading: 'lazy', box: { x: 0, y: 3100, width: 390, height: 290 } })]);
	assert.deepEqual(imageLoadingFailures('/', lazyBelow), []);
	const twin = pages([img({ loading: 'lazy', preloaded: true, naturalWidth: 0, naturalHeight: 0 })], [img({ loading: 'lazy', preloaded: true, naturalWidth: 0, naturalHeight: 0 })]);
	assert.match(imageLoadingFailures('/', twin)[0]!.actual, /preloaded in the head; desktop not drawn/);
	const hero = pages([img({ loading: 'lazy', naturalWidth: 3840, naturalHeight: 4146, box: { x: 0, y: 378, width: 1009, height: 1090 } })], [img({ loading: 'lazy', naturalWidth: 3840, naturalHeight: 4146, box: { x: 0, y: 378, width: 577, height: 623 } })]);
	assert.deepEqual(
		imageLoadingFailures('/', hero).map((f) => f.expected),
		['fetched with the page: a first screen shows it', 'a srcset of widths with sizes: its 577 px box needs at most 1154 px on a 2x phone'],
	);
	const responsive = pages([img({ widths: true, naturalWidth: 1080, naturalHeight: 1166, box: { x: 0, y: 378, width: 1009, height: 1090 } })], [img({ widths: true, naturalWidth: 1080, naturalHeight: 1166, box: { x: 0, y: 378, width: 577, height: 623 } })]);
	assert.deepEqual(imageLoadingFailures('/', responsive), []);
});

test('an image a phone does not draw and a desktop shows first is lazy, and its preload only fetches it from that width', async () => {
	const { drawnMedia, sizesFor } = await import('../src/convert/images.ts');
	const page = `<!DOCTYPE html><html><head><link rel="preload" href="/banner.jpg" as="image"></head><body><img src="/banner.jpg" loading="eager"></body></html>`;
	const doc = parseDocument(page);
	const facts: Record<string, ImageFacts> = {
		desktop: { viewport: { width: 1280, height: 800 }, images: [fact(key('/banner.jpg'), true, 0, 1280, { '767': 0, '768': 768, '1279': 1279, '1920': 1920 })] },
		mobile: { viewport: { width: 390, height: 844 }, images: [fact(key('/banner.jpg'), false, 0, 0)] },
	};
	const plan = planImages(doc, pairImages(doc, facts), undefined, new Map());
	assert.equal(attr(imgs(doc)[0]!, 'loading'), 'lazy');
	assert.equal(attr(find(head(doc), (el) => el.tagName === 'link')!, 'media'), '(min-width: 768px)');
	assert.equal(plan.someScreens, 1);
	assert.equal(drawnMedia({ '390': 10, '767': 0, '768': 10 }), undefined, 'not one range');
	assert.equal(drawnMedia({ '390': 577, '767': 1100, '768': 0, '1279': 0, '1280': 0, '1920': 0 }), '(max-width: 767px)', 'a phone-only hero');
	assert.equal(sizesFor({ '390': 577, '767': 1100, '768': 0, '1279': 0, '1280': 0, '1920': 0 }), '(max-width: 767px) 148vw, (max-width: 1279px) 100vw, 100vw');
});

test("an image's renditions share its identity: the optimizer's source, or the file name less its hash and width", async () => {
	const { imageIdentity, responsiveRegionsCandidate } = await import('../src/check/automatic.ts');
	const same = (a: string, b: string) => assert.equal(imageIdentity(a), imageIdentity(b), `${a} ~ ${b}`);
	same('/assets/vite-featurepanel-1-background.BHnDg8j4.jpg', '/assets/vite-featurepanel-1-background-640w.webp');
	same('/assets/vite-featurepanel-1-background.BHnDg8j4.jpg', '/assets/vite-featurepanel-1-background-828w.Cq81zZ2k.webp');
	same('/_next/image?url=%2Fa.png&w=3840&q=75', '/_next/image?url=%2Fa.png&w=640&q=75');
	assert.notEqual(imageIdentity('/assets/vite-featurepanel-1-background.jpg'), imageIdentity('/assets/vite-featurepanel-4-background.jpg'));
	assert.notEqual(imageIdentity('/img/logo-2024.png'), imageIdentity('/img/logo-2025.png'));
	const old = { src: '/a.BHnDg8j4.jpg', alt: '', naturalWidth: 1126, naturalHeight: 840, broken: false, box: { x: 0, y: 0, width: 411, height: 307 } };
	const next = { ...old, src: '/a-640w.webp', naturalWidth: 640, naturalHeight: 477 };
	const page = (images: (typeof old)[]) => ({ images }) as unknown as Parameters<typeof responsiveRegionsCandidate>[1];
	assert.ok(responsiveRegionsCandidate([{ x: 0, y: 0, width: 400, height: 300 }], page([old]), page([next]), 900));
	assert.equal(responsiveRegionsCandidate([{ x: 0, y: 0, width: 400, height: 300 }], page([old]), page([next]), 60_000), undefined, 'most of its pixels changed: another picture');
});
