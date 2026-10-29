import { decodePreset, encodePreset, isPresetCode, V1_CHART_COLOR_MAP, type PresetConfig } from 'shadcn/preset';
import { FONT_DEFINITIONS } from './font-definitions.ts';
import {
	BASE_COLORS,
	BASES,
	buildRegistryTheme,
	buildThemeForPreset,
	DEFAULT_CONFIG,
	getThemesForBaseColor,
	iconLibraries,
	MENU_ACCENTS,
	MENU_COLORS,
	POINTER_CURSOR_SELECTOR,
	PRESETS,
	RADII,
	STYLES,
	THEMES,
	type DesignSystemConfig,
} from './create-registry.ts';

// app/(app)/(create)/lib: /create's params and their URL form (search-params.ts on nuqs: a preset code carries the
// design system, a default leaves the URL), shuffle (use-random), reset (use-reset), the history entries (use-history),
// the commands and theme Get Code writes, and what the preview document applies (design-system-provider).

export { CMD_K_FORWARD_TYPE, DARK_MODE_FORWARD_TYPE, DESIGN_SYSTEM_MESSAGE, DESIGN_SYSTEM_READY, OPEN_PRESET_FORWARD_TYPE, RANDOMIZE_FORWARD_TYPE, REDO_FORWARD_TYPE, RESET_FORWARD_TYPE, UNDO_FORWARD_TYPE } from './create-messages.ts';

export interface CreateFont {
	readonly name: string;
	readonly value: string;
	readonly type: string;
	readonly fontFamily: string;
}

const FONT_ORDER = ['geist', 'inter', 'noto-sans', 'nunito-sans', 'figtree', 'roboto', 'raleway', 'dm-sans', 'public-sans', 'outfit', 'oxanium', 'manrope', 'space-grotesk', 'montserrat', 'ibm-plex-sans', 'source-sans-3', 'instrument-sans', 'geist-mono', 'jetbrains-mono', 'noto-serif', 'roboto-slab', 'merriweather', 'lora', 'playfair-display', 'eb-garamond', 'instrument-serif'];

/** lib/fonts.ts's FONTS: the customizer's fonts, in its order, with the family the preview sets. */
export const FONTS: readonly CreateFont[] = FONT_ORDER.map((name) => {
	const d = FONT_DEFINITIONS.find((f) => f.name === name)!;
	return { name: d.title, value: d.name, type: d.type, fontFamily: `var(${d.previewVariable}), ${d.family}` };
});
export const findFont = (value: string): CreateFont | undefined => FONTS.find((f) => f.value === value);

export const TEMPLATE_VALUES = ['next', 'next-monorepo', 'start', 'start-monorepo', 'react-router', 'react-router-monorepo', 'vite', 'vite-monorepo', 'astro', 'astro-monorepo', 'laravel'] as const;

export interface CreateParams {
	readonly preset: string;
	readonly base: string;
	readonly item: string;
	readonly iconLibrary: string;
	readonly style: string;
	readonly theme: string;
	readonly chartColor: string;
	readonly font: string;
	readonly fontHeading: string;
	readonly baseColor: string;
	readonly menuAccent: string;
	readonly menuColor: string;
	readonly radius: string;
	readonly template: string;
	readonly rtl: boolean;
	readonly pointer: boolean;
	readonly size: number;
	readonly custom: boolean;
}
export type CreateKey = keyof CreateParams;
export type CreateValue = string | number | boolean;
export type CreateUpdate = Partial<Record<CreateKey, CreateValue | null>>;

// The parsers object's order: createSerializer and the iframe's src write keys in it.
export const DEFAULTS: CreateParams = {
	preset: 'b0',
	base: DEFAULT_CONFIG.base,
	item: 'preview-02',
	iconLibrary: DEFAULT_CONFIG.iconLibrary,
	style: DEFAULT_CONFIG.style,
	theme: DEFAULT_CONFIG.theme,
	chartColor: DEFAULT_CONFIG.chartColor ?? 'neutral',
	font: DEFAULT_CONFIG.font,
	fontHeading: DEFAULT_CONFIG.fontHeading,
	baseColor: DEFAULT_CONFIG.baseColor,
	menuAccent: DEFAULT_CONFIG.menuAccent,
	menuColor: DEFAULT_CONFIG.menuColor,
	radius: 'default',
	template: 'next',
	rtl: false,
	pointer: false,
	size: 100,
	custom: false,
};
export const CREATE_KEYS = Object.keys(DEFAULTS) as CreateKey[];

const LITERALS: Partial<Record<CreateKey, readonly string[]>> = {
	base: BASES.map((b) => b.name),
	iconLibrary: Object.values(iconLibraries).map((i) => i.name),
	style: STYLES.map((s) => s.name),
	theme: THEMES.map((t) => t.name),
	chartColor: THEMES.map((t) => t.name),
	font: FONTS.map((f) => f.value),
	fontHeading: ['inherit', ...FONTS.map((f) => f.value)],
	baseColor: BASE_COLORS.map((b) => b.name),
	menuAccent: MENU_ACCENTS.map((a) => a.value),
	menuColor: MENU_COLORS.map((m) => m.value),
	radius: RADII.map((r) => r.name),
	template: TEMPLATE_VALUES,
};

/** Design system keys a preset code carries. */
export const DESIGN_SYSTEM_KEYS = ['style', 'baseColor', 'theme', 'chartColor', 'iconLibrary', 'font', 'fontHeading', 'radius', 'menuAccent', 'menuColor'] as const;
export type LockableParam = (typeof DESIGN_SYSTEM_KEYS)[number];
const NON_DESIGN_SYSTEM_KEYS = ['base', 'item', 'preset', 'template', 'rtl', 'pointer', 'size', 'custom'] as const;

/** A parser's reading of one raw value: null when it does not parse (the default then applies). */
function parseValue(key: CreateKey, raw: string): CreateValue | null {
	const d = DEFAULTS[key];
	if (typeof d === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : null;
	if (typeof d === 'number') {
		const n = parseInt(raw, 10);
		return Number.isNaN(n) ? null : n;
	}
	const literals = LITERALS[key];
	return !literals || literals.includes(raw) ? raw : null;
}

/** useQueryStates' raw values: each param parsed from the query, the default where absent or invalid. */
export function rawParams(search: string): CreateParams {
	const query = new URLSearchParams(search);
	const out: Record<string, CreateValue> = {};
	for (const key of CREATE_KEYS) {
		const raw = query.get(key);
		out[key] = (raw === null ? null : parseValue(key, raw)) ?? DEFAULTS[key];
	}
	return out as unknown as CreateParams;
}

export const isTranslucentMenuColor = (menuColor?: string | null): boolean => menuColor === 'default-translucent' || menuColor === 'inverted-translucent';

function normalizePartial(update: CreateUpdate): CreateUpdate {
	if (update.menuAccent === 'bold' && isTranslucentMenuColor(update.menuColor as string | undefined)) return { ...update, menuAccent: 'subtle' };
	return update;
}

/** normalizeDesignSystemParams: heading = body is inherit, theme and chart color fit the base color, no bold accent on a translucent menu. */
export function normalize(params: CreateParams): CreateParams {
	let result: CreateParams = { ...params, fontHeading: params.fontHeading === params.font ? 'inherit' : params.fontHeading };
	if (result.baseColor) {
		const available = getThemesForBaseColor(result.baseColor);
		const themeValid = available.some((t) => t.name === result.theme);
		const chartValid = available.some((t) => t.name === result.chartColor);
		if (!themeValid || !chartValid) {
			const fallback = available[0]?.name ?? result.baseColor;
			result = { ...result, ...(!themeValid && { theme: fallback }), ...(!chartValid && { chartColor: fallback }) };
		}
	}
	if (result.menuAccent === 'bold' && isTranslucentMenuColor(result.menuColor)) return { ...result, menuAccent: 'subtle' };
	return result;
}

/** resolvePresetOverrides: a preset's heading and chart color, unless the URL names its own. */
function presetOverrides(query: URLSearchParams, decoded: PresetConfig): { fontHeading: string; chartColor: string } {
	const fontHeading = query.has('fontHeading') ? (query.get('fontHeading') ?? decoded.fontHeading) : decoded.fontHeading;
	const v1 = (V1_CHART_COLOR_MAP as Record<string, string | undefined>)[decoded.theme];
	const chartColor = query.has('chartColor') ? (query.get('chartColor') ?? decoded.chartColor ?? v1 ?? decoded.theme) : (decoded.chartColor ?? v1 ?? decoded.theme);
	return { fontHeading, chartColor };
}

/** useDesignSystemSearchParams' params: the raw ones, a valid preset code's design system laid over them. */
export function parseParams(search: string): CreateParams {
	const raw = rawParams(search);
	if (raw.preset && isPresetCode(raw.preset)) {
		const decoded = decodePreset(raw.preset);
		if (decoded) {
			return normalize({
				...raw,
				...(decoded as unknown as Partial<CreateParams>),
				...presetOverrides(new URLSearchParams(search), decoded),
				base: raw.base,
				item: raw.item,
				preset: raw.preset,
				template: raw.template,
				rtl: raw.rtl,
				pointer: raw.pointer,
				size: raw.size,
				custom: raw.custom,
			});
		}
	}
	return normalize(raw);
}

/** getPresetCode: the design system's preset code. */
export const presetCode = (p: Pick<CreateParams, LockableParam>): string =>
	encodePreset({
		style: p.style,
		baseColor: p.baseColor,
		theme: p.theme,
		chartColor: p.chartColor,
		iconLibrary: p.iconLibrary,
		font: p.font,
		fontHeading: p.fontHeading,
		radius: p.radius,
		menuAccent: p.menuAccent,
		menuColor: p.menuColor,
	} as Partial<PresetConfig>);

/** buildPresetUrlUpdate: the raw update a design system change writes, its code in place of the keys it encodes. */
export function presetUrlUpdate(merged: CreateParams, resolved: CreateUpdate = {}): CreateUpdate {
	const update: CreateUpdate = { preset: presetCode(merged) };
	for (const key of DESIGN_SYSTEM_KEYS) update[key] = null;
	for (const key of NON_DESIGN_SYSTEM_KEYS) {
		if (key === 'preset') continue;
		update[key] = key in resolved ? (resolved[key] as CreateValue | null) : merged[key];
	}
	return update;
}

/** The raw update setParams(updates) makes: through the preset code when a design system key changes, as given otherwise. */
export function setParamsUpdate(current: CreateParams, updates: CreateUpdate): CreateUpdate {
	const resolved = normalizePartial(updates);
	if (!DESIGN_SYSTEM_KEYS.some((key) => key in resolved)) return resolved;
	const merged = normalize({ ...current, ...(resolved as Partial<CreateParams>) });
	return presetUrlUpdate(merged, resolved);
}

const serialize = (key: CreateKey, value: CreateValue): string => String(value);

/**
 * The query string after nuqs's update: a key set to null or to its default leaves the URL (clearOnDefault), any
 * other is written where it stands or appended; keys not in the update and unrelated params are kept.
 */
export function updateSearch(search: string, update: CreateUpdate): string {
	const query = new URLSearchParams(search);
	for (const [key, value] of Object.entries(update) as [CreateKey, CreateValue | null | undefined][]) {
		if (value === null || value === undefined || value === DEFAULTS[key]) query.delete(key);
		else query.set(key, serialize(key, value));
	}
	const text = query.toString();
	return text ? `?${text}` : '';
}

/** createSerializer: the base path with every non-default param, in the parsers' order. */
export function serializeParams(base: string, params: CreateParams): string {
	const query = new URLSearchParams();
	for (const key of CREATE_KEYS) if (params[key] !== DEFAULTS[key]) query.set(key, serialize(key, params[key]));
	const text = query.toString();
	return text ? `${base}?${text}` : base;
}

export const previewSrcOf = (params: CreateParams): string => serializeParams(`/preview/${params.base}/${params.item}`, params);

// lib/shuffle-presets.ts: curated preset codes from https://dialectcn.xyz.
export const SHUFFLE_PRESETS = ['b6sUj34d9', 'b2tqYzpa88', 'b1W4tDrk', 'b1aIuQ2XC', 'b7jsW1RxJ5', 'b870VEw0in', 'b3Zheoix4U', 'b1x9M2c4aI', 'b1W7jDEW', 'b51GFh7y6', 'b2fms620zo', 'b1Q5GC', 'buKEvLs', 'b5rR41Mtnc', 'b6tOz2I0x', 'b2hNTREGRN', 'bdIJ7Sq', 'b6TqMNb5Wb', 'bJIirQ', 'b4aRK5K0fb', 'b5HCiD38LI', 'bdHjvCi', 'b7QDHijUjj', 'b4ZVZIPi9h', 'b1W4bcno'];

const randomItem = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

/** useRandom's randomize: a curated preset other than the current one, locked params kept. */
export function shuffled(current: CreateParams, locks: readonly string[], random: () => number = Math.random): CreateUpdate | null {
	const code = presetCode(current);
	const available = SHUFFLE_PRESETS.filter((c) => c !== code);
	const decoded = decodePreset(randomItem(available.length > 0 ? available : SHUFFLE_PRESETS, random));
	if (!decoded) return null;
	const keep = (key: LockableParam, value: string) => (locks.includes(key) ? current[key] : value);
	return {
		style: keep('style', decoded.style),
		baseColor: keep('baseColor', decoded.baseColor),
		theme: keep('theme', decoded.theme),
		chartColor: keep('chartColor', decoded.chartColor ?? decoded.theme),
		iconLibrary: keep('iconLibrary', decoded.iconLibrary),
		font: keep('font', decoded.font),
		fontHeading: keep('fontHeading', decoded.fontHeading),
		menuAccent: keep('menuAccent', decoded.menuAccent),
		menuColor: keep('menuColor', decoded.menuColor),
		radius: keep('radius', decoded.radius),
	};
}

/**
 * The R key's shuffle: two useRandom hooks (MainMenu's and RandomButton's) each listen for it and draw from the same
 * params; nuqs writes both as one URL update, the second draw's.
 */
export function shuffledByKey(current: CreateParams, locks: readonly string[], random: () => number = Math.random): CreateUpdate | null {
	const first = shuffled(current, locks, random);
	return shuffled(current, locks, random) ?? first;
}

/** useReset's reset: the base and style kept, everything else the preset made for them. */
export function resetUpdate(current: CreateParams): CreateUpdate {
	const preset = PRESETS.find((p) => p.base === current.base && p.style === current.style) ?? DEFAULT_CONFIG;
	return {
		base: current.base,
		style: current.style,
		baseColor: preset.baseColor,
		theme: preset.theme,
		chartColor: preset.chartColor,
		iconLibrary: preset.iconLibrary,
		font: preset.font,
		fontHeading: preset.fontHeading,
		menuAccent: preset.menuAccent,
		menuColor: preset.menuColor,
		radius: preset.radius,
		template: DEFAULT_CONFIG.template ?? 'next',
		item: current.item,
	};
}

/** parsePresetInput: a code, or `--preset CODE`, when it is one. */
export function parsePresetInput(value: string): string | null {
	const input = value.trim();
	if (!input) return null;
	const preset = input.match(/^--preset\b\s+(.+)$/i)?.[1]?.trim() ?? input;
	return isPresetCode(preset) ? preset : null;
}

// lib/templates.ts.
export const NO_MONOREPO_FRAMEWORKS = ['laravel'];
export const frameworkOf = (template: string): string => template.replace('-monorepo', '');
export const templateValue = (framework: string, monorepo: boolean): string => (NO_MONOREPO_FRAMEWORKS.includes(framework) ? framework : monorepo ? `${framework}-monorepo` : framework);

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const runner = (pm: PackageManager, version: string, local: boolean): string => {
	if (local) return 'shadcn';
	if (pm === 'pnpm') return `pnpm dlx shadcn${version}`;
	if (pm === 'npm') return `npx shadcn${version}`;
	if (pm === 'yarn') return `yarn dlx shadcn${version}`;
	return `bunx --bun shadcn${version}`;
};

/** ProjectForm's init command for a package manager. */
export function initCommand(params: CreateParams, pm: PackageManager, options: { readonly version?: string; readonly local?: boolean } = {}): string {
	const framework = frameworkOf(params.template);
	const flags = ` --preset ${presetCode(params)}${params.base !== DEFAULT_CONFIG.base ? ` --base ${params.base}` : ''} --template ${framework}${params.template.endsWith('-monorepo') ? ' --monorepo' : ''}${params.rtl ? ' --rtl' : ''}${params.pointer ? ' --pointer' : ''}`;
	return `${runner(pm, options.version ?? '@latest', options.local ?? false)} init${flags}`;
}

export const APPLY_MODES = [
	{ value: 'full', title: 'Full preset', description: 'Everything from the preset, including components, theme, and fonts.' },
	{ value: 'theme', title: 'Theme only', description: 'Theme tokens only, like colors, radii, and shadows. Components stay as they are.' },
	{ value: 'font', title: 'Fonts only', description: 'Only preset fonts for body and headings. Components stay as they are.' },
] as const;

/** ProjectForm's apply command for a package manager and apply mode. */
export function applyCommand(params: CreateParams, pm: PackageManager, mode: string, options: { readonly version?: string; readonly local?: boolean } = {}): string {
	const only = mode === 'theme' ? ' --only theme' : mode === 'font' ? ' --only font' : '';
	return `${runner(pm, options.version ?? '@latest', options.local ?? false)} apply --preset ${presetCode(params)}${only}`;
}

const cssRule = (selector: string, vars?: Record<string, string>) => `${selector} {\n${Object.entries(vars ?? {})
	.map(([k, v]) => `  --${k}: ${v};`)
	.join('\n')}\n}`;

/** The config Get Code's theme is built from (radius none where the style locks it). */
export function themeConfig(params: CreateParams): DesignSystemConfig {
	return {
		...DEFAULT_CONFIG,
		base: params.base,
		style: params.style,
		baseColor: params.baseColor,
		theme: params.theme,
		chartColor: params.chartColor,
		iconLibrary: params.iconLibrary,
		font: params.font,
		fontHeading: params.fontHeading,
		menuAccent: params.menuAccent,
		menuColor: params.menuColor,
		radius: params.style === 'lyra' || params.style === 'sera' ? 'none' : params.radius,
		template: params.template,
		rtl: params.rtl,
		pointer: params.pointer,
	} as DesignSystemConfig;
}

/** ProjectForm's Theme tab: the preset's CSS variables. */
export function themeCss(params: CreateParams): string {
	const theme = buildThemeForPreset(themeConfig(params));
	if (!theme.cssVars) return '';
	return [cssRule(':root', theme.cssVars.light as Record<string, string>), cssRule('.dark', theme.cssVars.dark as Record<string, string>)].join('\n\n');
}

const buildCssRule = (selector: string, vars?: Record<string, string>): string => {
	const declarations = Object.entries(vars ?? {})
		.filter(([, value]) => Boolean(value))
		.map(([key, value]) => `  --${key}: ${value};`)
		.join('\n');
	return declarations ? `${selector} {\n${declarations}\n}\n` : `${selector} {}\n`;
};

/** What DesignSystemProvider applies to the preview document for a set of params. */
export interface PreviewDesign {
	readonly bodyClasses: readonly string[];
	readonly fontSans?: string;
	readonly fontHeading?: string;
	readonly themeCss: string;
	readonly menuInverted: boolean;
	readonly menuTranslucent: boolean;
}

export function previewDesign(params: CreateParams): PreviewDesign {
	const radius = params.style === 'lyra' ? 'none' : params.radius;
	const font = findFont(params.font);
	const heading = params.fontHeading === 'inherit' || params.fontHeading === params.font ? font : findFont(params.fontHeading);
	const theme = buildRegistryTheme({ ...DEFAULT_CONFIG, baseColor: params.baseColor, theme: params.theme, chartColor: params.chartColor, menuAccent: params.menuAccent, radius } as DesignSystemConfig);
	const vars = theme.cssVars;
	const css = [buildCssRule(':root', { ...(vars.theme ?? {}), ...(vars.light ?? {}) }), buildCssRule('.dark', vars.dark), params.pointer ? `@layer base {\n  ${POINTER_CURSOR_SELECTOR} {\n    cursor: pointer;\n  }\n}\n` : ''].filter(Boolean).join('\n');
	return {
		bodyClasses: [`style-${params.style}`, `base-color-${params.baseColor}`],
		...(font ? { fontSans: font.fontFamily } : {}),
		...(heading ? { fontHeading: heading.fontFamily } : {}),
		themeCss: css,
		menuInverted: params.menuColor === 'inverted' || params.menuColor === 'inverted-translucent',
		menuTranslucent: isTranslucentMenuColor(params.menuColor),
	};
}

/** What the iframe's DesignSystemProvider writes back to its own URL: Lyra and Sera have no radius, Rhea no large one. */
export function radiusFix(params: CreateParams): CreateUpdate | null {
	if ((params.style === 'lyra' || params.style === 'sera') && params.radius !== 'none') return { radius: 'none' };
	if (params.style === 'rhea' && params.radius === 'large') return { radius: 'default' };
	return null;
}
