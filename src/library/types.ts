import type { EngineChoice } from '../overrides.ts';

/**
 * What a migration does with a library:
 * - `ported`: markless-migrate ships a Markless port of it, certified against the library itself; copy it, never rewrite it.
 * - `markless-ui`: a @markless/ui family does the same job; render that family.
 * - `as-is`: framework-agnostic code that renders nothing; import it unchanged from the Markless app.
 * - `dom`: draws its own UI into the page (a grid, chart, editor, map), with or without a framework
 *   wrapper. A wrapper is always ported; `decision` says whether the library underneath is ported too or used directly.
 * - `parity`: bound to the old framework; port exactly the used surface into `lib/parity/<library>/`.
 * - `framework`: the old framework or its router; Markless itself replaces it.
 * - `drop`: needed only by the old framework (providers, devtools, slots); nothing to port.
 * - `unknown`: not in the catalog and not installed, so its framework could not be read.
 */
export type LibraryClass = 'ported' | 'markless-ui' | 'as-is' | 'parity' | 'dom' | 'framework' | 'drop' | 'unknown';

/** One export of a library and the port component that replaces it. */
export interface PortPart {
	readonly component: string;
	/** The library's own props the component covers; element props (class, id, data-*, aria-*, events) always pass through. */
	readonly props: readonly string[];
	/** The library's props the port does not cover, each with what the port does instead. */
	readonly unsupported: Readonly<Record<string, string>>;
	readonly note?: string;
}

/** A Markless port of a library, shipped in src/library/ports/<dir>/ and certified against the library by a test. */
export interface LibraryPort {
	readonly library: string;
	/** The library version the certifying test compares against. */
	readonly version: string;
	readonly certifiedBy: string;
	readonly dir: string;
	/** The file in `dir` that exports this library's components. */
	readonly module: string;
	readonly files: readonly string[];
	/** By the library's export name (`Content`); a namespace or alias name (`DialogContent`) resolves by its suffix. */
	readonly parts: Readonly<Record<string, PortPart>>;
	/** How to write what the old app does around the library, and what the port knowingly does differently. */
	readonly notes: readonly string[];
}

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
	/** `family.part` in @markless/ui, or the family alone; for a `ported` library, the port's component. */
	readonly target: string;
	/** For a `ported` library: the file in the new app that exports `target`. */
	readonly from?: string;
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
	/** For a `ported` library: where the port lives and what certifies it. */
	readonly port?: { readonly dir: string; readonly version: string; readonly certifiedBy: string };
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
	/** Library parts rendered through their child (Radix `asChild`, Base UI `render`): the page shows the child's element. */
	readonly compositions?: Composition[];
	/** The app's own submit handlers, carried over from the source as code, or refused with the reason. */
	readonly handlers?: CarriedHandler[];
	/** The app's components that keep React state, converted to Markless state() from the source, or refused with the reason. */
	readonly stateComponents?: StateComponent[];
	readonly limits: string[];
}

/** Code with a component's state and computed values left as their index in `slots`, so each instance names its own. */
export type StateCode = readonly (string | number)[];

/** One value a component keeps: a useState/useReducer state, or a value derived from them (a `const`, a useMemo). */
export interface StateSlot {
	readonly name: string;
	readonly kind: 'state' | 'computed';
	/** A state's initial value as a literal, a computed's expression. */
	readonly init: StateCode;
}

/** An attribute that reads state: its expression and the value the page shows at load (null for absent). */
export interface BoundAttribute {
	readonly code: StateCode;
	readonly initial: string | null;
	/** A port's attribute the library wrote nothing for: the page has none of it to check. */
	readonly added?: true;
}

/** What a component renders, as the page can find it: elements with what the source fixes for them, and what reads state. */
export type StateNode =
	| {
			readonly kind: 'element';
			/** A host element's tag; a component's element is known by `slots`. */
			readonly tag?: string;
			readonly slots?: readonly string[];
			/** Attribute values the source fixes, by DOM name. */
			readonly attrs: Readonly<Record<string, string>>;
			readonly bound?: Readonly<Record<string, BoundAttribute>>;
			/** Handlers that read or write state, by tsrx event prop (`onClick`): each a function expression. */
			readonly events?: Readonly<Record<string, StateCode>>;
			/** Its whole text, when its children are text alone and some of it reads state. */
			readonly text?: BoundAttribute;
			/** What it renders inside, in order; absent when it shows its children as the page has them. */
			readonly children?: readonly StateNode[];
			/** Its children sit somewhere inside it (a component's), not as its own children in order. */
			readonly loose?: true;
			/** It opens a layer of the page (the dialog whose open state it carries): found only on an element that does. */
			readonly opens?: true;
	  }
	/** Text: what the source fixes, or (`bound`) what it computes from state. */
	| { readonly kind: 'text'; readonly value: string; readonly bound?: BoundAttribute }
	/** Markup the page has and the state does not decide (the component's children, a library component). */
	| { readonly kind: 'opaque' }
	| {
			readonly kind: 'if';
			readonly test: StateCode;
			readonly initial: boolean;
			readonly then: readonly StateNode[];
			readonly else: readonly StateNode[];
			/** The arm the page did not show at load, as tsrx written from the source. */
			readonly markup?: StateCode;
	  }
	| {
			readonly kind: 'for';
			readonly list: StateCode;
			readonly item: string;
			readonly index?: string;
			readonly key: StateCode;
			/** How many rows the page shows at load. */
			readonly initial: number;
			/** The tag of each row's element. */
			readonly tag: string;
			/** One row as tsrx written from the source, reading `item`. */
			readonly markup: StateCode;
	  };

/** A component of the app that keeps React state, converted to Markless state, or refused with why. */
export interface StateComponent {
	readonly file: string;
	readonly line: number;
	readonly component: string;
	readonly slots?: readonly StateSlot[];
	readonly nodes?: readonly StateNode[];
	readonly refused?: string;
	/** Each effect it runs (useEffect, useLayoutEffect), by line, and why it is not converted. */
	readonly effects?: readonly { readonly line: number; readonly reason: string }[];
	/** States that only mirror a library part's controlled prop: the part keeps them itself, as its port does, so they are not declared. */
	readonly partState?: readonly { readonly state: string; readonly part: string; readonly prop: string }[];
	readonly routes?: string[];
}

/** One app handler of the source: the element it is given to, found in the page as a composition's is, and its code. */
export interface CarriedHandler {
	readonly file: string;
	readonly line: number;
	readonly element: string;
	/** The DOM event it answers (`submit`). */
	readonly event: string;
	/** Every data-slot its element can render with. */
	readonly slots: string[];
	/** Text the source fixes for the element and what it renders (its JSX text, the strings of the module data it shows). */
	readonly words: string[];
	/**
	 * A function taking the library functions it calls (`calls`, in order) and returning the handler: every declaration
	 * it reads is inside, its TypeScript taken out.
	 */
	readonly code?: string;
	/** Each library function it calls, by the name it calls it under. */
	readonly calls?: Readonly<Record<string, { readonly from: string; readonly imported: string }>>;
	/** It cancels its event first (`event.preventDefault()`, left out of `code`): the page cancels it as it dispatches. */
	readonly cancels?: boolean;
	/** Why it is not carried: it reads the component's props, React state, a hook, or a value the page has none of. */
	readonly refused?: string;
	readonly routes?: string[];
}

/** One element of the source that renders a library part through its child, so the page's element may carry the child's data-slot. */
export interface Composition {
	readonly library: string;
	readonly export: string;
	/** The part's role, named as its slots are: `dialog-close`, `alert-dialog-cancel`, `popover-trigger`. */
	readonly part: string;
	/** `direct`: the part's own element, which the source gives no data-slot (new-york-v4's sheet corner Close). */
	readonly via: 'asChild' | 'render' | 'direct';
	/** Every data-slot the rendered element can carry: the part's own (from its wrappers) and its child's. Which one wins depends on how the props merge. */
	readonly slots: string[];
	/** The text it shows, as the source writes it. */
	readonly text?: string;
	readonly label?: string;
	/** The data-slot of the nearest element around it that the source names one for. */
	readonly within?: string;
	/** The texts of the elements in its parent, itself at `index` (null where the source computes one), when the source fixes that row. */
	readonly siblings?: (string | null)[];
	readonly index?: number;
	readonly file: string;
	readonly line: number;
	readonly routes?: string[];
}
