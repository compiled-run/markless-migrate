import type { EngineChoice } from '../overrides.ts';

/**
 * What a migration does with a library:
 * - `markless-ui`: a @markless/ui family does the same job; render that family.
 * - `as-is`: framework-agnostic code that renders nothing; import it unchanged from the Markless app.
 * - `dom`: draws its own UI into the page (a grid, chart, editor, map), with or without a framework
 *   wrapper. A wrapper is always ported; `decision` says whether the library underneath is ported too or used directly.
 * - `parity`: bound to the old framework; port exactly the used surface into `lib/parity/<library>/`.
 * - `framework`: the old framework or its router; Markless itself replaces it.
 * - `drop`: needed only by the old framework (providers, devtools, slots); nothing to port.
 * - `unknown`: not in the catalog and not installed, so its framework could not be read.
 */
export type LibraryClass = 'markless-ui' | 'as-is' | 'parity' | 'dom' | 'framework' | 'drop' | 'unknown';

export interface Site {
	readonly file: string;
	readonly line: number;
}

export interface PropUsage {
	/** Literal values written at the usage sites, in first-seen order. */
	values: (string | number | boolean | null)[];
	/** Sites that pass something other than a literal (a variable, a function, a spread). */
	dynamic: number;
	sites: number;
}

export interface UsageSite extends Site {
	readonly kind: 'element' | 'call' | 'type' | 'reference';
	/** For an element: each prop as written (`"outline"`, `{expression}`, `true` for a bare prop). */
	readonly props?: Readonly<Record<string, string>>;
	/** Literal text between the element's tags, when there is any. */
	readonly text?: string;
	/** The component the site sits in, as `file#Name`. */
	readonly in?: string;
	/** Routes that render this site, from the component graph. */
	readonly routes?: readonly string[];
}

export interface FamilyMapping {
	/** `family.part` in @markless/ui, or the family alone. */
	readonly target: string;
	/** Whether the @markless/ui installed in the new app ships it; null when @markless/ui is not installed there. */
	readonly available: boolean | null;
	readonly note?: string;
}

export interface ExportUsage {
	/** The exported name, or `Namespace.Member` for a namespace import used by member. */
	readonly name: string;
	kind: 'component' | 'hook' | 'function' | 'type' | 'value';
	readonly imports: Site[];
	readonly sites: UsageSite[];
	/** Components: every prop passed at any site. */
	readonly props: Record<string, PropUsage>;
	/** Hooks and functions: option keys of the first object argument (nested keys as `a.b`). */
	readonly options: Record<string, PropUsage>;
	/**
	 * Keys of the object and array literals passed to it as data, by path from the prop or argument
	 * (`columnDefs[].field`, `defaultColDef.sortable`, `args[1].rowData`), with the literal values written.
	 * Members read on functions passed this way (a cell renderer's `params.value`) are in `members` under the same path.
	 */
	data?: Record<string, PropUsage>;
	/** Fields and methods read from what a hook or function returns (`handleSubmit`, `getRowModel().rows`). */
	readonly reads: string[];
	/** Members read on values typed with this export, keyed by where the value came from (`` for a direct annotation, `cell.row` for a callback parameter). */
	readonly members: Record<string, string[]>;
	/** Variants of a local `cva()` component that the app passes, and the classes each adds. */
	variants?: Record<string, { used: string[]; available: string[]; classes: Record<string, string> }>;
	maps?: FamilyMapping;
	/** For a local UI kit export: the library parts its definition renders (`@radix-ui/react-tabs Trigger`). */
	wraps?: string[];
	/** The files each read, member and option was seen in (`read:handleSubmit()`, `member:cell.row:original`, `option:resolver`), so a port can be narrowed to some routes. */
	at?: Record<string, string[]>;
}

export interface LibraryCss {
	/** Stylesheets of the library the app imports. */
	readonly imports: Site[];
	/** Class names, data attributes and custom properties the library puts on the page (found in its code). */
	readonly injected: string[];
	/** Places the app styles what the library puts on the page: a class, a `data-*` attribute or a custom property. */
	readonly styled: { token: string; sites: Site[] }[];
	/** For a local UI kit: the class strings its used exports write. */
	readonly classes?: Record<string, string>;
}

export interface LibraryUsage {
	readonly name: string;
	readonly version?: string;
	/** For a UI kit that lives in the app (shadcn/ui): where its files are. */
	readonly local?: { readonly dir: string; readonly files: readonly string[] };
	readonly framework: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'angular' | 'none' | 'unknown';
	readonly class: LibraryClass;
	readonly reason: string;
	/** A framework-agnostic package the library is built on, to keep as-is under a ported adapter. */
	readonly core?: string;
	/** What replaces it: `@markless/router`, a @markless/ui family, a platform feature. */
	readonly replacement?: string;
	readonly exports: ExportUsage[];
	readonly css: LibraryCss;
	/** Exports the app uses against every export the package's types declare (null when the package is not installed). */
	readonly surface: { readonly used: number; readonly total: number | null; readonly members: number };
	readonly sites: number;
	/** Libraries whose usage is only through this one (a Radix primitive used only inside shadcn/ui files). */
	readonly via?: string;
	/** For a `dom` library: what was measured about the library that draws the UI (itself, or the one a wrapper drives). */
	readonly engine?: EngineFacts;
	/** For a `dom` library: port it or use it directly, decided by plan from `engine` and the used surface. */
	decision?: LibraryDecision;
}

export interface EngineFacts {
	readonly name: string;
	/** It draws into a canvas or a WebGL context, so check sees only its pixels. */
	readonly draws?: 'canvas' | 'webgl';
	/** Behaviour check's journeys never perform (they click, type into fields and press keys). */
	readonly needs?: 'text editing' | 'dragging, panning or zooming';
	/** Bytes of its main entry when installed. */
	readonly bytes?: number;
}

export interface LibraryDecision {
	readonly choice: EngineChoice;
	/** Which rule decided: `override`, `draws-pixels`, `unchecked-behaviour`, `large-surface`, `engine-smaller`, `small-surface`. */
	readonly rule: string;
	readonly reason: string;
	/** Used names counted: exports, props, options, data keys, members and fields read, across the library and its wrappers. */
	readonly surface: number;
	readonly engine: string;
}

export interface LibrariesFile {
	readonly version: 1;
	readonly generatedAt: string;
	readonly source: string;
	readonly framework: string | null;
	/** The @markless/ui version installed in the new app, whose families `available` was checked against. */
	readonly markless_ui?: string;
	readonly libraries: LibraryUsage[];
	readonly limits: string[];
}
