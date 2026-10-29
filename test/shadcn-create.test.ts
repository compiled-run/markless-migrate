import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	applyCommand,
	DEFAULTS,
	initCommand,
	parseParams,
	parsePresetInput,
	presetCode,
	presetUrlUpdate,
	previewDesign,
	previewSrcOf,
	radiusFix,
	resetUpdate,
	setParamsUpdate,
	shuffled,
	shuffledByKey,
	SHUFFLE_PRESETS,
	themeCss,
	updateSearch,
	type CreateParams,
	type CreateUpdate,
} from '../examples/shadcn-ui-markless/lib/site/create-params.ts';

// What ui.shadcn.com's /create (the pinned build, mm-shadcn-ui-old) wrote for these steps, read off the page.
const set = (search: string, update: CreateUpdate) => updateSearch(search, setParamsUpdate(parseParams(search), update));

test('each pick re-encodes the design system into the preset code and keeps the other keys out of the URL', () => {
	const steps: [CreateUpdate, string][] = [
		[{ style: 'vega' }, ''],
		[{ baseColor: 'stone' }, ''],
		[{ theme: 'blue' }, ''],
		[{ chartColor: 'rose' }, '?preset=b501j57my'],
		[{ fontHeading: 'lora' }, '?preset=b4GlTyXvgO'],
		[{ font: 'geist' }, '?preset=b4GlTyXyLY'],
		[{ iconLibrary: 'tabler' }, '?preset=b4GlTyYWRc'],
		[{ radius: 'large' }, '?preset=b4GlTyYWVk'],
		[{ menuAccent: 'bold' }, '?preset=b4GlTyYWVs'],
	];
	let search = '';
	for (const [update, want] of steps) {
		search = set(search, update);
		if (want) assert.equal(search, want);
		else assert.match(search, /^\?preset=b\w+$/);
	}
	search = set(search, { item: 'preview' });
	assert.equal(search, '?preset=b4GlTyYWVs&item=preview');
	assert.equal(previewSrcOf(parseParams(search)), '/preview/base/preview?preset=b4GlTyYWVs&item=preview&iconLibrary=tabler&style=vega&theme=blue&chartColor=rose&font=geist&fontHeading=lora&baseColor=stone&menuAccent=bold&radius=large');
});

test('the default design system is code b0, which leaves the URL; radius and style picks give the codes the old page wrote', () => {
	assert.equal(presetCode(DEFAULTS), 'b0');
	assert.equal(set('', { radius: 'large' }), '?preset=b48');
	assert.equal(set('?preset=b48', { style: 'lyra' }), '?preset=buFywOu');
	assert.equal(set('?preset=buFywOu', { style: 'rhea' }), '?preset=b27GcrVw');
});

test('a preset code is read back into its design system; the keys around it stay as the URL has them', () => {
	const p = parseParams('?preset=b4GlTyYWVs&item=preview&template=vite&rtl=true');
	assert.deepEqual(
		[p.style, p.baseColor, p.theme, p.chartColor, p.fontHeading, p.font, p.iconLibrary, p.radius, p.menuAccent, p.item, p.template, p.rtl],
		['vega', 'stone', 'blue', 'rose', 'lora', 'geist', 'tabler', 'large', 'bold', 'preview', 'vite', true],
	);
	// The default code b0 is read like any other: a URL's own heading overrides it, the same as the body is inherit.
	assert.equal(parseParams('?fontHeading=lora').fontHeading, 'lora');
	assert.equal(parseParams('?fontHeading=inter').fontHeading, 'inherit');
	// Without a code, a theme the base color lacks falls back to it.
	assert.equal(parseParams('?preset=nope&baseColor=stone&theme=zinc').theme, 'stone');
});

test('buildPresetUrlUpdate clears the keys it encodes and keeps template and the other non-design keys', () => {
	const merged: CreateParams = { ...DEFAULTS, template: 'start' };
	const update = presetUrlUpdate(merged);
	assert.equal(update.preset, 'b0');
	assert.equal(update.style, null);
	assert.equal(update.template, 'start');
	assert.equal(presetUrlUpdate(merged, { template: 'vite' }).template, 'vite');
});

test('a bold accent is subtle on a translucent menu', () => {
	const p = parseParams(set('', { menuColor: 'default-translucent', menuAccent: 'bold' }));
	assert.equal(p.menuAccent, 'subtle');
	assert.equal(p.menuColor, 'default-translucent');
});

test('shuffle takes a curated preset other than the current one and keeps the locked params', () => {
	const current = parseParams('?preset=b4GlTyYWVs');
	const next = shuffled(current, ['font', 'radius'], () => 0)!;
	assert.equal(next.font, 'geist');
	assert.equal(next.radius, 'large');
	const decoded = parseParams(`?preset=${SHUFFLE_PRESETS[0]}`);
	assert.equal(next.style, decoded.style);
	assert.equal(next.theme, decoded.theme);
	// The current preset is never drawn again.
	const onFirst = parseParams(`?preset=${SHUFFLE_PRESETS[0]}`);
	assert.equal(presetCode({ ...onFirst, ...(shuffled(onFirst, [], () => 0) as Partial<CreateParams>) }), SHUFFLE_PRESETS[1]);
});

test('the R key draws twice from the same params (MainMenu\'s and RandomButton\'s useRandom) and keeps the second draw', () => {
	const seq = [0.33, 0.71, 0.2];
	let i = 0;
	const next = shuffledByKey(parseParams('?preset=b4GlTyYWVs'), [], () => seq[i++ % seq.length]!)!;
	assert.equal(presetCode({ ...parseParams('?preset=b4GlTyYWVs'), ...(next as Partial<CreateParams>) }), 'b6TqMNb5Wb');
	assert.equal(i, 2);
});

test('reset keeps base, style and the preview item and takes the rest from the preset for that base and style', () => {
	const update = resetUpdate(parseParams('?preset=b4GlTyYWVs&base=radix&item=preview'));
	assert.deepEqual([update.base, update.style, update.item, update.template, update.iconLibrary], ['radix', 'vega', 'preview', 'next', 'lucide']);
});

test('Open Preset takes a code or a --preset flag', () => {
	assert.equal(parsePresetInput('b0'), 'b0');
	assert.equal(parsePresetInput(' --preset b0 '), 'b0');
	assert.equal(parsePresetInput('open sesame'), null);
});

test('Get Code writes the init command with the template, base, monorepo, RTL and pointer flags, and the apply command per mode', () => {
	const p = parseParams('?preset=b4GlTyYWVs&base=radix&template=vite-monorepo&rtl=true&pointer=true');
	assert.equal(initCommand(p, 'pnpm'), 'pnpm dlx shadcn@latest init --preset b4GlTyYWVs --base radix --template vite --monorepo --rtl --pointer');
	assert.equal(initCommand(parseParams(''), 'npm'), 'npx shadcn@latest init --preset b0 --template next');
	assert.equal(initCommand(parseParams('?template=laravel'), 'bun'), 'bunx --bun shadcn@latest init --preset b0 --template laravel');
	assert.equal(applyCommand(p, 'yarn', 'theme'), 'yarn dlx shadcn@latest apply --preset b4GlTyYWVs --only theme');
	assert.equal(applyCommand(p, 'pnpm', 'full'), 'pnpm dlx shadcn@latest apply --preset b4GlTyYWVs');
});

test('the theme tab writes :root and .dark from the preset, the radius the style allows', () => {
	const css = themeCss(parseParams('?preset=b48'));
	assert.match(css, /^:root \{\n {2}--background: oklch\(1 0 0\);/);
	assert.match(css, /--radius: 0.875rem;/);
	assert.match(css, /\n\n\.dark \{\n/);
	assert.match(themeCss(parseParams('?preset=buFywOu')), /--radius: 0;/);
});

test('the preview applies the style and base color classes, the fonts, the theme and the menu color', () => {
	const d = previewDesign(parseParams('?preset=b4GlTyYWVs'));
	assert.deepEqual(d.bodyClasses, ['style-vega', 'base-color-stone']);
	assert.equal(d.fontSans, "var(--font-geist-sans), 'Geist Variable', sans-serif");
	assert.equal(d.fontHeading, "var(--font-lora), 'Lora Variable', serif");
	assert.match(d.themeCss, /^:root \{\n/);
	assert.equal(d.menuInverted, false);
	assert.deepEqual(radiusFix(parseParams('?preset=buFywOu')), { radius: 'none' });
	assert.equal(radiusFix({ ...parseParams('?preset=buFywOu'), radius: 'none' }), null);
	assert.deepEqual(radiusFix(parseParams('?preset=b27GcrVw')), { radius: 'default' });
});
