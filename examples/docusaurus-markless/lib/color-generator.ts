// The site's ColorGenerator (src/components/ColorGenerator) and the colour code it shares with its ColorModeToggle
// override (src/utils/colorUtils.ts), with the `color` 4.2.3 package's maths it calls.
import colorNames from './color-names.json';
import prismThemes from './prism-themes.json';

type Shade = { adjustment: number; adjustmentInput: string; displayOrder: number; codeOrder: number };
type Shades = Record<string, Shade>;
type ColorState = { baseColor: string; background: string; shades: Shades };

const SUFFIX = '-189';
const COLOR_SHADES: Shades = {
	'--ifm-color-primary': { adjustment: 0, adjustmentInput: '0', displayOrder: 3, codeOrder: 0 },
	'--ifm-color-primary-dark': { adjustment: 0.1, adjustmentInput: '10', displayOrder: 4, codeOrder: 1 },
	'--ifm-color-primary-darker': { adjustment: 0.15, adjustmentInput: '15', displayOrder: 5, codeOrder: 2 },
	'--ifm-color-primary-darkest': { adjustment: 0.3, adjustmentInput: '30', displayOrder: 6, codeOrder: 3 },
	'--ifm-color-primary-light': { adjustment: -0.1, adjustmentInput: '-10', displayOrder: 2, codeOrder: 4 },
	'--ifm-color-primary-lighter': { adjustment: -0.15, adjustmentInput: '-15', displayOrder: 1, codeOrder: 5 },
	'--ifm-color-primary-lightest': { adjustment: -0.3, adjustmentInput: '-30', displayOrder: 0, codeOrder: 6 },
};
const LIGHT_PRIMARY_COLOR = '#2e8555';
const DARK_PRIMARY_COLOR = '#25c2a0';
const LIGHT_BACKGROUND_COLOR = '#ffffff';
const DARK_BACKGROUND_COLOR = '#181920';
const storageKey = (dark: boolean) => `ifm-theme-colors-${dark ? 'dark' : 'light'}${SUFFIX}`;
function session(): Storage | undefined {
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}

// color-string 1.9.1 `get`, color-convert 2.0.1 conversions, color 4.2.3 limiters.
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(min, n), max);
function parse(input: string): { model: 'rgb' | 'hsl' | 'hwb'; value: number[] } | null {
	const prefix = input.substring(0, 3).toLowerCase();
	if (prefix === 'hsl' || prefix === 'hwb') {
		const re =
			prefix === 'hsl'
				? /^hsla?\(\s*([+-]?(?:\d{0,3}\.)?\d+)(?:deg)?\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[,|/]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*)?\)$/
				: /^hwb\(\s*([+-]?\d{0,3}(?:\.\d+)?)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*)?\)$/;
		const m = input.match(re);
		if (!m) return null;
		const alpha = parseFloat(m[4]!);
		return { model: prefix, value: [((parseFloat(m[1]!) % 360) + 360) % 360, clamp(parseFloat(m[2]!), 0, 100), clamp(parseFloat(m[3]!), 0, 100), clamp(Number.isNaN(alpha) ? 1 : alpha, 0, 1)] };
	}
	let rgb = [0, 0, 0, 1];
	let m: RegExpMatchArray | null;
	if ((m = input.match(/^#([a-f0-9]{6})([a-f0-9]{2})?$/i))) {
		for (let i = 0; i < 3; i++) rgb[i] = parseInt(m[1]!.slice(i * 2, i * 2 + 2), 16);
		if (m[2]) rgb[3] = parseInt(m[2], 16) / 255;
	} else if ((m = input.match(/^#([a-f0-9]{3,4})$/i))) {
		const s = m[1]!;
		for (let i = 0; i < 3; i++) rgb[i] = parseInt(s[i]! + s[i]!, 16);
		if (s[3]) rgb[3] = parseInt(s[3] + s[3], 16) / 255;
	} else if ((m = input.match(/^rgba?\(\s*([+-]?\d+)(?=[\s,])\s*(?:,\s*)?([+-]?\d+)(?=[\s,])\s*(?:,\s*)?([+-]?\d+)\s*(?:[,|/]\s*([+-]?[\d.]+)(%?)\s*)?\)$/))) {
		for (let i = 0; i < 3; i++) rgb[i] = parseInt(m[i + 1]!, 0);
		if (m[4]) rgb[3] = m[5] ? parseFloat(m[4]) * 0.01 : parseFloat(m[4]);
	} else if ((m = input.match(/^rgba?\(\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[,|/]\s*([+-]?[\d.]+)(%?)\s*)?\)$/))) {
		for (let i = 0; i < 3; i++) rgb[i] = Math.round(parseFloat(m[i + 1]!) * 2.55);
		if (m[4]) rgb[3] = m[5] ? parseFloat(m[4]) * 0.01 : parseFloat(m[4]);
	} else if ((m = input.match(/^(\w+)$/))) {
		if (m[1] === 'transparent') return { model: 'rgb', value: [0, 0, 0, 0] };
		const named = (colorNames as Record<string, number[]>)[m[1]!];
		if (!Object.hasOwn(colorNames, m[1]!) || !named) return null;
		return { model: 'rgb', value: [...named, 1] };
	} else return null;
	rgb = [clamp(rgb[0]!, 0, 255), clamp(rgb[1]!, 0, 255), clamp(rgb[2]!, 0, 255), clamp(rgb[3]!, 0, 1)];
	return { model: 'rgb', value: rgb };
}
function rgbToHsl([r0, g0, b0]: number[]): number[] {
	const r = r0! / 255;
	const g = g0! / 255;
	const b = b0! / 255;
	const min = Math.min(r, g, b);
	const max = Math.max(r, g, b);
	const delta = max - min;
	let h = 0;
	if (max === min) h = 0;
	else if (r === max) h = (g - b) / delta;
	else if (g === max) h = 2 + (b - r) / delta;
	else if (b === max) h = 4 + (r - g) / delta;
	h = Math.min(h * 60, 360);
	if (h < 0) h += 360;
	const l = (min + max) / 2;
	const s = max === min ? 0 : l <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
	return [h, s * 100, l * 100];
}
function hslToRgb([h0, s0, l0]: number[]): number[] {
	const h = h0! / 360;
	const s = s0! / 100;
	const l = l0! / 100;
	if (s === 0) return [l * 255, l * 255, l * 255];
	const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const t1 = 2 * l - t2;
	const rgb = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		let t3 = h + (1 / 3) * -(i - 1);
		if (t3 < 0) t3++;
		if (t3 > 1) t3--;
		const val = 6 * t3 < 1 ? t1 + (t2 - t1) * 6 * t3 : 2 * t3 < 1 ? t2 : 3 * t3 < 2 ? t1 + (t2 - t1) * (2 / 3 - t3) * 6 : t1;
		rgb[i] = val * 255;
	}
	return rgb;
}
function hwbToRgb([h0, w0, b0]: number[]): number[] {
	const h = h0! / 360;
	let wh = w0! / 100;
	let bl = b0! / 100;
	const ratio = wh + bl;
	if (ratio > 1) {
		wh /= ratio;
		bl /= ratio;
	}
	const i = Math.floor(6 * h);
	const v = 1 - bl;
	let f = 6 * h - i;
	if ((i & 0x01) !== 0) f = 1 - f;
	const n = wh + f * (v - wh);
	const [r, g, b] = [[v, n, wh], [n, v, wh], [wh, v, n], [wh, n, v], [n, wh, v], [v, wh, n]][i === 6 ? 0 : i] ?? [v, n, wh];
	return [r! * 255, g! * 255, b! * 255];
}
const limitRgb = (c: number[]) => c.slice(0, 3).map((v) => Math.max(0, Math.min(255, v)));
const limitHsl = (c: number[]) => [((c[0]! % 360) + 360) % 360, Math.max(0, Math.min(100, c[1]!)), Math.max(0, Math.min(100, c[2]!))];
function toRgb(input: string): number[] {
	const parsed = parse(input);
	if (!parsed) throw new Error(`Unable to parse color from string: ${input}`);
	const v = parsed.value.slice(0, 3);
	if (parsed.model === 'rgb') return limitRgb(v);
	if (parsed.model === 'hsl') return limitRgb(hslToRgb(limitHsl(v)));
	return limitRgb(hwbToRgb([((v[0]! % 360) + 360) % 360, Math.max(0, Math.min(100, v[1]!)), Math.max(0, Math.min(100, v[2]!))]));
}
const hexDouble = (n: number) => {
	const s = Math.round(n).toString(16).toUpperCase();
	return s.length < 2 ? `0${s}` : s;
};
const hexOf = (rgb: number[]) => `#${limitRgb(rgb).map((v) => hexDouble(Number(v.toFixed(0)))).join('')}`;
const colorHex = (input: string) => hexOf(toRgb(input));
function darkenHex(input: string, ratio: number): string {
	const hsl = limitHsl(rgbToHsl(toRgb(input)));
	hsl[2] = hsl[2]! - hsl[2]! * ratio;
	return hexOf(hslToRgb(hsl));
}
function luminosity(rgb: number[]): number {
	const lum = rgb.map((v) => {
		const chan = v / 255;
		return chan <= 0.04045 ? chan / 12.92 : ((chan + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lum[0]! + 0.7152 * lum[1]! + 0.0722 * lum[2]!;
}
function wcagContrast(foreground: string, background: string): string {
	const a = luminosity(toRgb(foreground));
	const b = luminosity(toRgb(background));
	const contrast = a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
	return contrast > 7 ? 'AAA 🏅' : contrast > 4.5 ? 'AA 👍' : 'Fail 🔴';
}
const adjusted = (shades: Shades, baseColor: string) => Object.keys(shades).map((name) => ({ ...shades[name]!, variableName: name, hex: darkenHex(baseColor, shades[name]!.adjustment) }));

function updateDOMColors({ shades, baseColor, background }: ColorState, dark: boolean): void {
	const sheet = [...document.styleSheets].find((item) => item.href?.match(/styles(?:\.[\da-f]+)?\.css/));
	if (!sheet) return;
	const selector = dark ? '[data-theme="dark"]' : '[data-theme="light"]';
	const rules = [...sheet.cssRules] as CSSStyleRule[];
	const stale = rules.findIndex((rule) => rule.selectorText === selector && [...rule.style].includes('--ifm-color-primary') && rule.style.length < 10);
	if (stale >= 0) sheet.deleteRule(stale);
	const style = `${selector} {\n  ${adjusted(shades, baseColor)
		.map((value) => `  ${value.variableName}: ${value.hex};`)
		.join('\n')}\n  --ifm-background-color: ${background};\n}`;
	sheet.insertRule(style, sheet.cssRules.length - 1);
}
const defaults = (dark: boolean): ColorState => ({ baseColor: dark ? DARK_PRIMARY_COLOR : LIGHT_PRIMARY_COLOR, background: dark ? DARK_BACKGROUND_COLOR : LIGHT_BACKGROUND_COLOR, shades: COLOR_SHADES });
function stored(dark: boolean): Partial<ColorState> {
	try {
		return JSON.parse(session()?.getItem(storageKey(dark)) ?? '{}') as Partial<ColorState>;
	} catch {
		return {};
	}
}

/** The site's ColorModeToggle override: on every page, a colour mode change applies that mode's saved palette. */
export function onColorModeChange(choice: 'light' | 'dark' | null): void {
	const dark = choice === 'dark';
	let state: ColorState | null = null;
	try {
		state = JSON.parse(session()?.getItem(storageKey(dark)) ?? 'null') as ColorState | null;
	} catch {
		state = null;
	}
	updateDOMColors(state ?? defaults(dark), dark);
}

type Generator = { root: HTMLElement; rows: Map<string, HTMLTableRowElement>; code: string; dark: boolean; inputColor: string; baseColor: string; background: string; shades: Shades; setColorMode: (mode: 'light' | 'dark') => void };
const generators = new WeakMap<HTMLElement, Generator>();
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

function setInput(input: HTMLInputElement | null, value: string): void {
	if (!input) return;
	if (input.value !== value) input.value = value;
	if (input.defaultValue !== value) input.defaultValue = value;
}

type Dict = Record<string, Record<string, string | number> | undefined>;
function cssDict(dark: boolean): Dict {
	const theme = (prismThemes as unknown as Record<string, { plain: Record<string, string>; styles: { types: string[]; languages?: string[]; style: Record<string, string | number> }[] }>)[dark ? 'dark' : 'light']!;
	const dict: Dict = {};
	for (const entry of theme.styles) {
		if (entry.languages && !entry.languages.includes('css')) continue;
		for (const type of entry.types) dict[type] = { ...dict[type], ...entry.style };
	}
	dict.plain = { ...theme.plain, backgroundColor: '' };
	return dict;
}
// As React updates a style prop: properties the new style lacks are cleared, which can leave an empty attribute.
function updateStyle(el: HTMLElement, style: Record<string, string | number> | undefined): void {
	const next = Object.fromEntries(Object.entries(style ?? {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(v)]));
	for (let i = el.style.length - 1; i >= 0; i--) if (!(el.style[i]! in next)) el.style.removeProperty(el.style[i]!);
	for (const [name, value] of Object.entries(next)) if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
// Prism's CSS tokens for the generated snippet's three line shapes.
function cssLine(text: string): [string[], string][] {
	if (text === '}') return [[['plain'], ''], [['punctuation'], '}']];
	const decl = /^( {2})(--[\w-]+)(:)( )(#[\da-f]+)(;)$/i.exec(text);
	if (decl) return [[['plain'], decl[1]!], [['variable'], decl[2]!], [['punctuation'], ':'], [['plain'], ' '], [['hexcode', 'color'], decl[5]!], [['punctuation'], ';'], [['plain'], '']];
	if (text === ':root {') return [[['selector', 'pseudo-class'], ':root'], [['plain'], ' '], [['punctuation'], '{'], [['plain'], '']];
	return [
		[['selector', 'attribute', 'punctuation'], '['],
		[['selector', 'attribute', 'attr-name'], 'data-theme'],
		[['selector', 'attribute', 'operator'], '='],
		[['selector', 'attribute', 'attr-value'], "'dark'"],
		[['selector', 'attribute', 'punctuation'], ']'],
		[['plain'], ' '],
		[['punctuation'], '{'],
		[['plain'], ''],
	];
}
function renderCode(code: HTMLElement, text: string, dark: boolean): void {
	const dict = cssDict(dark);
	const lines = text.split('\n');
	const existing = [...code.children] as HTMLElement[];
	lines.forEach((line, i) => {
		let div = existing[i];
		if (!div) {
			div = document.createElement('div');
			div.className = 'token-line';
			div.append(document.createElement('br'));
			code.append(div);
		}
		updateStyle(div, dict.plain);
		const tokens = cssLine(line);
		const spans = [...div.querySelectorAll<HTMLElement>(':scope > span')];
		tokens.forEach(([types, content], j) => {
			let span = spans[j];
			if (!span) {
				span = document.createElement('span');
				div.insertBefore(span, div.lastElementChild);
			}
			const className = ['token', ...types].join(' ');
			if (span.className !== className) span.className = className;
			updateStyle(span, types.length === 1 && types[0] === 'plain' ? undefined : Object.assign({}, ...types.map((t) => dict[t])));
			if (span.textContent !== content) span.textContent = content;
		});
		for (const extra of spans.slice(tokens.length)) extra.remove();
	});
	for (const extra of existing.slice(lines.length)) extra.remove();
}

function render(g: Generator): void {
	const { root, dark, baseColor, background, shades } = g;
	const [primaryInput, colorInput] = root.querySelectorAll<HTMLInputElement>('p input');
	setInput(primaryInput ?? null, g.inputColor);
	setInput(colorInput ?? null, baseColor);
	setInput(root.querySelector<HTMLInputElement>('#background_color'), background);
	const [modeButton] = root.querySelectorAll<HTMLButtonElement>('p button');
	if (modeButton) modeButton.textContent = `Edit ${dark ? 'light' : 'dark'} mode`;
	const tbody = root.querySelector('tbody');
	const values = adjusted(shades, baseColor).sort((a, b) => a.displayOrder - b.displayOrder);
	const shown = values.map((value) => g.rows.get(value.variableName)).filter((tr): tr is HTMLTableRowElement => Boolean(tr));
	if (tbody && shown.some((tr, i) => tbody.children[i] !== tr || tbody.children.length !== shown.length)) tbody.replaceChildren(...shown);
	for (const value of values) {
		const tr = g.rows.get(value.variableName);
		if (!tr) continue;
		const [, hexCell, adjustCell, ratingCell] = tr.cells;
		const swatch = hexCell?.querySelector('span') as HTMLElement | null;
		if (swatch && swatch.style.backgroundColor !== value.hex) swatch.style.backgroundColor = value.hex;
		const hexCode = hexCell?.querySelector('code');
		if (hexCode && hexCode.textContent !== value.hex.toLowerCase()) hexCode.textContent = value.hex.toLowerCase();
		setInput(adjustCell?.querySelector('input') ?? null, value.adjustmentInput);
		if (ratingCell) {
			if (ratingCell.style.backgroundColor !== background) ratingCell.style.backgroundColor = background;
			if (ratingCell.style.color !== value.hex) ratingCell.style.color = value.hex;
			const b = ratingCell.querySelector('b');
			const rating = wcagContrast(value.hex, background);
			if (b && b.textContent !== rating) b.textContent = rating;
		}
	}
	const code = [...root.querySelectorAll<HTMLElement>('.theme-code-block pre code')].at(-1);
	if (code) {
		const text = `${dark ? "[data-theme='dark']" : ':root'} {\n${adjusted(shades, baseColor)
			.sort((a, b) => a.codeOrder - b.codeOrder)
			.map((value) => `  ${value.variableName}: ${value.hex.toLowerCase()};`)
			.join('\n')}${background !== defaults(dark).background ? `\n  --ifm-background-color: ${background};` : ''}\n}`;
		if (g.code !== `${dark}${text}`) renderCode(code, text, dark);
		g.code = `${dark}${text}`;
	}
}
function commit(g: Generator): void {
	render(g);
	updateDOMColors(g, g.dark);
	session()?.setItem(storageKey(g.dark), JSON.stringify({ baseColor: g.baseColor, background: g.background, shades: g.shades }));
}
function loadMode(g: Generator, dark = isDark()): void {
	g.dark = dark;
	const values = stored(g.dark);
	const fallback = defaults(g.dark);
	g.inputColor = values.baseColor ?? fallback.baseColor;
	g.baseColor = values.baseColor ?? fallback.baseColor;
	g.background = values.background ?? fallback.background;
	g.shades = values.shades ?? COLOR_SHADES;
	commit(g);
}

let modeObserver: MutationObserver | undefined;
/** Wires every ColorGenerator on the page; `setColorMode` is the theme's own colour mode switch. */
export function initColorGenerator(setColorMode: (mode: 'light' | 'dark') => void): void {
	for (const input of document.querySelectorAll<HTMLInputElement>('input#primary_color')) {
		const root = input.parentElement?.parentElement as HTMLElement | null;
		if (!root || generators.has(root)) continue;
		const g: Generator = { root, rows: new Map([...root.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => [tr.querySelector('td code')?.textContent ?? '', tr])), code: '', dark: false, inputColor: '', baseColor: '', background: '', shades: COLOR_SHADES, setColorMode };
		generators.set(root, g);
		const updateColor = (event: Event) => {
			const value = (event.target as HTMLInputElement).value.replace(/^(?=[^#])/, '#');
			g.inputColor = value;
			try {
				g.baseColor = colorHex(value);
			} catch {
				render(g);
				return;
			}
			commit(g);
		};
		const [primaryInput, colorInput] = root.querySelectorAll<HTMLInputElement>('p input');
		primaryInput?.addEventListener('input', updateColor);
		colorInput?.addEventListener('input', updateColor);
		root.querySelector<HTMLInputElement>('#background_color')?.addEventListener('input', (event) => {
			g.background = (event.target as HTMLInputElement).value;
			commit(g);
		});
		const [modeButton, resetButton] = root.querySelectorAll<HTMLButtonElement>('p button');
		modeButton?.addEventListener('click', () => g.setColorMode(g.dark ? 'light' : 'dark'));
		resetButton?.addEventListener('click', () => {
			const fallback = defaults(g.dark);
			g.inputColor = fallback.baseColor;
			g.baseColor = fallback.baseColor;
			g.background = fallback.background;
			g.shades = COLOR_SHADES;
			commit(g);
		});
		for (const tr of root.querySelectorAll('tbody tr')) {
			const name = tr.querySelector('td code')?.textContent ?? '';
			tr.querySelector('input')?.addEventListener('input', (event) => {
				const raw = (event.target as HTMLInputElement).value;
				const next = parseFloat(raw);
				const shade = g.shades[name]!;
				g.shades = { ...g.shades, [name]: { ...shade, adjustmentInput: raw, adjustment: Number.isNaN(next) ? shade.adjustment : next / 100.0 } };
				commit(g);
			});
		}
		const code = [...root.querySelectorAll<HTMLElement>('.theme-code-block pre code')].at(-1);
		g.code = `false${[...(code?.querySelectorAll('.token-line') ?? [])].map((line) => line.textContent).join('\n')}`;
		// The original first renders in light mode (its colour mode state starts light), then in the page's mode.
		loadMode(g, false);
		if (isDark()) loadMode(g);
	}
	modeObserver ??= new MutationObserver(() => {
		for (const input of document.querySelectorAll<HTMLInputElement>('input#primary_color')) {
			const g = generators.get(input.parentElement?.parentElement as HTMLElement);
			if (g && g.dark !== isDark()) loadMode(g);
		}
	});
	modeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
