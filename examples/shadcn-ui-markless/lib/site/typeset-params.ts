import { FONT_DEFINITIONS, type FontDefinition } from './font-definitions.ts';

// app/(app)/(typeset)/lib: the typeset customizer's params, their URL form (nuqs: a default leaves the URL), the history
// snapshots, shuffle, and the install instructions the docs panel writes from them.

export const TYPESET_PARAMS_MESSAGE = 'typeset-params';
export const TYPESET_COMMAND_MESSAGE = 'typeset-command';
export type TypesetCommand = 'shuffle' | 'reset' | 'undo' | 'redo' | 'toggle-theme';

// Display-only faces that read poorly as body text stay out of typeset.
const EXCLUDED_FONTS = ['instrument-serif', 'eb-garamond', 'playfair-display'];

export interface TypesetFont {
	readonly id: string;
	readonly label: string;
	readonly type: FontDefinition['type'];
	readonly value: string;
}

export const FONTS: readonly TypesetFont[] = FONT_DEFINITIONS.filter((d) => !EXCLUDED_FONTS.includes(d.name)).map((d) => ({ id: d.name, label: d.title, type: d.type, value: `var(${d.previewVariable}), ${d.family}` }));

export const findFont = (id: string | null | undefined): TypesetFont | undefined => FONTS.find((f) => f.id === id);
export const findFontDefinition = (id: string | null | undefined): FontDefinition | undefined => FONT_DEFINITIONS.find((d) => d.name === id);

export const FONT_GROUPS: readonly { readonly label: string; readonly fonts: readonly TypesetFont[] }[] = [
	{ label: 'Sans', fonts: FONTS.filter((f) => f.type === 'sans') },
	{ label: 'Serif', fonts: FONTS.filter((f) => f.type === 'serif') },
	{ label: 'Mono', fonts: FONTS.filter((f) => f.type === 'mono') },
];

export interface Option {
	readonly value: string;
	readonly label: string;
}

export const TYPESET_SIZES: readonly Option[] = [
	{ value: '14', label: '14px' },
	{ value: '15', label: '15px' },
	{ value: '16', label: '16px' },
	{ value: '18', label: '18px' },
];
export const TYPESET_LEADINGS: readonly Option[] = [
	{ value: '1.6', label: 'Tight (1.6)' },
	{ value: '1.75', label: 'Regular (1.75)' },
	{ value: '1.9', label: 'Loose (1.9)' },
];
export const TYPESET_FLOWS: readonly Option[] = [
	{ value: '1em', label: 'Compact (1em)' },
	{ value: '1.25em', label: 'Regular (1.25em)' },
	{ value: '2em', label: 'Airy (2em)' },
];
export const TYPESET_MEASURES: readonly (Option & { readonly width: string })[] = [
	{ value: '60', label: '60ch', width: '28em' },
	{ value: '70', label: '70ch', width: '33em' },
	{ value: '80', label: '80ch', width: '37em' },
	{ value: '90', label: '90ch', width: '42em' },
];
// The production build's specimens (the development-only ones are never offered).
export const CONTENT_OPTIONS: readonly (Option & { readonly number: string })[] = [
	{ value: 'docs', label: 'Docs' },
	{ value: 'chat', label: 'Chat' },
	{ value: 'article', label: 'Article' },
	{ value: 'changelog', label: 'Changelog' },
	{ value: 'notes', label: 'Notes' },
].map((option, index) => ({ ...option, number: String(index + 1).padStart(2, '0') }));

export interface TypesetParams {
	readonly body: string;
	readonly heading: string;
	readonly mono: string;
	readonly scale: string;
	readonly measure: string;
	readonly flow: string;
	readonly leading: string;
	readonly item: string;
}
export type TypesetKey = keyof TypesetParams;
export type LockableParam = Exclude<TypesetKey, 'item'>;

const VALUES: Readonly<Record<TypesetKey, readonly string[]>> = {
	body: FONTS.map((f) => f.id),
	heading: ['inherit', ...FONTS.map((f) => f.id)],
	mono: FONTS.map((f) => f.id),
	scale: TYPESET_SIZES.map((o) => o.value),
	measure: TYPESET_MEASURES.map((o) => o.value),
	flow: TYPESET_FLOWS.map((o) => o.value),
	leading: TYPESET_LEADINGS.map((o) => o.value),
	item: CONTENT_OPTIONS.map((o) => o.value),
};

// The parsers' order: the serializer writes keys in it.
export const DEFAULTS: TypesetParams = { body: 'geist', heading: 'inherit', mono: 'geist-mono', scale: '15', measure: '80', flow: '1.25em', leading: '1.75', item: 'docs' };
export const TYPESET_PARAM_KEYS = Object.keys(DEFAULTS) as TypesetKey[];

/** The value as the param's literal, or null when the param does not accept it. */
export const coerce = (key: TypesetKey, value: string): string | null => (VALUES[key].includes(value) ? value : null);

/** The params a query string gives (parseAsStringLiteral(...).withDefault): an invalid or absent value is the default. */
export function parseParams(search: string): TypesetParams {
	const query = new URLSearchParams(search);
	const out: Record<string, string> = {};
	for (const key of TYPESET_PARAM_KEYS) {
		const raw = query.get(key);
		out[key] = (raw !== null && coerce(key, raw)) || DEFAULTS[key];
	}
	return out as unknown as TypesetParams;
}

/**
 * The query string after nuqs's setParams(update): a key set to null or to its default leaves the URL, any other is
 * written where it stands (or appended); keys not in the update and unrelated params are kept.
 */
export function updateSearch(search: string, update: Partial<Record<TypesetKey, string | null>> | null): string {
	const query = new URLSearchParams(search);
	const entries = update === null ? TYPESET_PARAM_KEYS.map((k) => [k, null] as const) : (Object.entries(update) as [TypesetKey, string | null][]);
	for (const [key, value] of entries) {
		if (value === null || value === undefined || value === DEFAULTS[key]) query.delete(key);
		else query.set(key, value);
	}
	const text = query.toString();
	return text ? `?${text}` : '';
}

/** nuqs createSerializer: the base path with every non-default param, in the parsers' order. */
export function serializeParams(base: string, params: TypesetParams): string {
	const query = new URLSearchParams();
	for (const key of TYPESET_PARAM_KEYS) if (params[key] !== DEFAULTS[key]) query.set(key, params[key]);
	const text = query.toString();
	return text ? `${base}?${text}` : base;
}

/** A history entry: every param as the URL holds it, null when absent (restoring it clears back to the default). */
export function snapshotOf(search: string): string {
	const query = new URLSearchParams(search);
	return JSON.stringify(Object.fromEntries(TYPESET_PARAM_KEYS.map((key) => [key, query.get(key)])));
}

/** parseTypesetSnapshot: values checked against the params, unknown keys dropped, absent or invalid ones null. */
export function parseSnapshot(raw: string): Record<TypesetKey, string | null> {
	let parsed: Record<string, unknown> = {};
	try {
		const json: unknown = JSON.parse(raw);
		if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json as Record<string, unknown>;
	} catch {}
	const out = {} as Record<TypesetKey, string | null>;
	for (const key of TYPESET_PARAM_KEYS) {
		const value = parsed[key];
		out[key] = typeof value === 'string' ? coerce(key, value) : null;
	}
	return out;
}

const randomItem = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)]!;

/** useShuffle's shuffle: the type design at random (the specimen alone kept), locked params left out. */
export function shuffled(locks: readonly LockableParam[], random: () => number = Math.random): Partial<Record<TypesetKey, string>> {
	const bodyFonts = FONTS.filter((f) => f.type !== 'mono').map((f) => f.id);
	const monoFonts = FONTS.filter((f) => f.type === 'mono').map((f) => f.id);
	const next: Partial<Record<TypesetKey, string>> = {
		body: randomItem(bodyFonts, random),
		heading: randomItem(['inherit', ...bodyFonts], random),
		mono: randomItem(monoFonts, random),
		scale: randomItem(TYPESET_SIZES.map((o) => o.value), random),
		measure: randomItem(TYPESET_MEASURES.map((o) => o.value), random),
		leading: randomItem(TYPESET_LEADINGS.map((o) => o.value), random),
		flow: randomItem(TYPESET_FLOWS.map((o) => o.value), random),
	};
	for (const param of locks) delete next[param];
	return next;
}

/** preview-provider's previewValues: the CSS variables the preview document takes, undefined where it has none. */
export function previewValues(params: TypesetParams): Record<string, string | undefined> {
	const bodyFont = findFont(params.body)?.value;
	return {
		'--preview-size': `${params.scale}px`,
		'--preview-leading': params.leading,
		'--preview-flow': params.flow,
		'--preview-measure': TYPESET_MEASURES.find((o) => o.value === params.measure)?.width,
		'--preview-font': bodyFont,
		'--preview-font-heading': params.heading === 'inherit' ? bodyFont : findFont(params.heading)?.value,
		'--preview-font-mono': findFont(params.mono)?.value,
	};
}

// app/(app)/(create)/lib/templates.ts: the frameworks the docs panel writes instructions for.
export const FRAMEWORKS: readonly Option[] = [
	{ value: 'next', label: 'Next.js' },
	{ value: 'vite', label: 'Vite' },
	{ value: 'start', label: 'TanStack Start' },
	{ value: 'laravel', label: 'Laravel' },
	{ value: 'react-router', label: 'React Router' },
	{ value: 'astro', label: 'Astro' },
];

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** lib/highlight-code.ts's transforms of an npm command for each package manager. */
export function commandFor(packageManager: PackageManager, command: string): string {
	if (packageManager === 'pnpm') return command.replace('npm install', 'pnpm add').replace('npx', 'pnpm dlx');
	if (packageManager === 'yarn') return command.replace('npm install', 'yarn add').replace('npx', 'yarn dlx');
	if (packageManager === 'bun') return command.replace('npm install', 'bun add').replace('npx', 'bunx --bun');
	return command;
}

const toCamelCase = (name: string) => name.replace(/-(\w)/g, (_, char: string) => char.toUpperCase());

/** Everything docs-panel.tsx's TypesetDocsContent writes from the params and the framework. */
export interface TypesetDocs {
	readonly nextFontCode: string;
	readonly fontsourceCommand: string;
	readonly fontsourceCss: string;
	readonly preset: string;
	readonly usage: string;
	readonly prompt: string;
}

export function typesetDocs(params: TypesetParams, framework: string, appUrl: string): TypesetDocs {
	const picks = [params.body, params.heading, params.mono].filter((id) => id !== 'inherit' && findFont(id));
	const fonts = [...new Set(picks)].map((id) => findFontDefinition(id)).filter((d): d is FontDefinition => d !== undefined);
	const measureWidth = TYPESET_MEASURES.find((o) => o.value === params.measure)?.width;
	const presetName = `typeset-${params.item}`;
	const headingId = params.heading === 'inherit' ? params.body : params.heading;
	const presetCss = `.${presetName} {
  --typeset-font-body: var(--font-${params.body});
  --typeset-font-heading: var(--font-${headingId});
  --typeset-font-mono: var(--font-${params.mono});
  --typeset-size: ${params.scale}px;
  --typeset-leading: ${params.leading};
  --typeset-flow: ${params.flow};
}`;
	const preset = `/* globals.css */
@import "tailwindcss";
@import "./typeset.css";

${presetCss}`;
	const usage = `<div className="typeset ${presetName} max-w-[${measureWidth}]">
  {content}
</div>`;
	const nextFontCode = [
		`// app/layout.tsx`,
		`import { ${fonts.map((f) => f.import).join(', ')} } from "next/font/google"`,
		'',
		...fonts.map((f) => [`const ${toCamelCase(f.name)} = ${f.import}({`, `  subsets: ${JSON.stringify(f.subsets)},`, ...(f.weight ? [`  weight: ${JSON.stringify(f.weight)},`] : []), `  variable: "--font-${f.name}",`, `})`, ''].join('\n')),
		`<html className={\`${fonts.map((f) => `\${${toCamelCase(f.name)}.variable}`).join(' ')}\`}>`,
	].join('\n');
	const fontsourceCommand = `npm install ${fonts.map((f) => f.dependency).join(' ')}`;
	const fontsourceCss = [`/* globals.css */`, ...fonts.map((f) => `@import "${f.dependency}";`), '', ':root {', ...fonts.map((f) => `  --font-${f.name}: ${f.family};`), '}'].join('\n');
	const fontStep =
		framework === 'next'
			? `Load the fonts in the root layout and update the HTML element:

${nextFontCode}`
			: `Install the fonts:

${fontsourceCommand}

Then import them in the main CSS file:

${fontsourceCss}`;
	const prompt = `Install shadcn/typeset in this project.

Typeset is a single stylesheet that styles rendered markdown: wrap the output in a \`typeset\` container and everything inside (headings, lists, tables, code, blockquotes, math) is styled. Everything outside is untouched.

1. Download ${appUrl}/typeset.css and save it as typeset.css next to the project's main CSS file (where Tailwind is imported). If the file already exists, replace it with the downloaded copy.

2. Import it in the main CSS file, after the Tailwind import:

@import "./typeset.css";

3. ${fontStep}

4. Add this preset to the main CSS file, after the typeset import. If a class named .${presetName} already exists, update its values in place. Leave any other typeset-* presets untouched: they are separate surfaces:

${presetCss}

5. Do not apply the class anywhere yet. Search the project for surfaces that render markdown or rich content: react-markdown, Streamdown, or MDX components, dangerouslySetInnerHTML with parsed markdown, prose classes, CMS content renderers. Present the candidates you find as a short list and ask the user which surface should use typeset. Then wrap only the surface they pick:

${usage}

If the picked surface already has its own typography (a prose class, styled markdown components), list those styles and let the user decide what to remove before wrapping.

Notes:

- To exclude an embedded component from typeset styles, add the not-typeset class or the data-not-typeset attribute to it.
- Verify on the surface the user picked: headings, lists, tables, and code inside the container should be styled with no classes on the content itself.
- Docs: ${appUrl}/docs/typeset`;
	return { nextFontCode, fontsourceCommand, fontsourceCss, preset, usage, prompt };
}
