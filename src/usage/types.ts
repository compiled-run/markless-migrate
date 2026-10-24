import type { EmbedUse } from '../embed/types.ts';

/** Where a use was found: a source file and line, or a route's served page and the element. */
export type UseSite =
	| { readonly file: string; readonly line: number; readonly column?: number }
	| { readonly route: string; readonly element: string; readonly line?: number };

/**
 * One thing the old site does in the browser, found by reading its markup and code: an htmx attribute, an Alpine
 * directive, a theme feature, an effect a plain script has, a library component used with these props.
 */
export interface Behaviour {
	/** Stable across plans: `<library>:<feature>` plus a hash of what distinguishes this use. */
	readonly id: string;
	/** `htmx`, `alpine`, `hyperscript`, `class-tools`, `docusaurus-theme`, `vitepress-theme`, `script`, `embed`, or a package name. */
	readonly library: string;
	/** What is used, in the library's own words: `hx-get`, `x-show`, `color mode toggle`, `Dialog.Content`. */
	readonly feature: string;
	/** One line a person can read: what it does here. */
	readonly summary: string;
	/** What the use says, parsed: trigger events, swap style, target, directive modifiers, props passed. */
	readonly details: Readonly<Record<string, unknown>>;
	readonly routes: readonly string[];
	readonly sites: readonly UseSite[];
	/** The kind of obligation template that applies (`toggle`, `dialog`, `color-mode`, `request`, `embed-frame`...). */
	readonly kind: BehaviourKind;
}

export type BehaviourKind =
	| 'request'
	| 'boost'
	| 'toggle'
	| 'class-timeline'
	| 'show-hide'
	| 'bind'
	| 'model'
	| 'list'
	| 'state'
	| 'dialog'
	| 'disclosure'
	| 'tabs'
	| 'menu'
	| 'color-mode'
	| 'theme-init'
	| 'search'
	| 'sidebar'
	| 'navbar'
	| 'toc'
	| 'copy'
	| 'dismiss'
	| 'scroll'
	| 'embed-frame'
	| 'listener'
	| 'storage'
	| 'media-query'
	| 'timer'
	| 'fetch'
	| 'navigation'
	| 'observer'
	| 'dom-write'
	| 'component'
	| 'library';

/** A check a behaviour must pass. `mechanism` names what in check performs it; `available` says whether this checker has it yet. */
export interface Obligation {
	readonly id: string;
	readonly behaviour: string;
	readonly text: string;
	readonly mechanism: Mechanism;
	/** Concrete steps, so a checker family can run them without reading prose. */
	readonly steps: readonly ObligationStep[];
	readonly routes: readonly string[];
}

export type Mechanism = 'journey' | 'keyboard' | 'motion' | 'css-states' | 'client-guard' | 'storage' | 'sequence' | 'pinned-frames' | 'navigation-equivalence' | 'scheme-sequence' | 'load-state' | 'embed';

export type ObligationStep =
	| { readonly do: 'load'; readonly emulate?: { readonly colorScheme?: 'light' | 'dark'; readonly storage?: Readonly<Record<string, string>>; readonly platform?: string; readonly cpuSlowdown?: number } }
	| { readonly do: 'click' | 'hover' | 'focus' | 'press' | 'type' | 'scroll'; readonly target: string; readonly key?: string; readonly text?: string; readonly times?: number }
	| { readonly do: 'wait'; readonly ms: number }
	| { readonly do: 'navigate-in-place'; readonly to: string }
	| { readonly do: 'compare'; readonly what: readonly string[]; readonly at?: readonly string[] };

export interface Implementation {
	readonly behaviour: string;
	/** `part`: a shared Markless part does it (a @markless/ui family or a per-library part); `site`: the new app's own code, declared in usage-map.json. */
	readonly status: 'implemented' | 'unimplemented';
	readonly by?: string;
	readonly how?: 'part' | 'site';
	/** For unimplemented: what would implement it. */
	readonly suggestion?: string;
}

export interface UsageInventory {
	readonly version: 1;
	readonly generatedAt: string;
	readonly origin?: string;
	readonly source?: string;
	readonly built?: string;
	readonly pages: number;
	readonly behaviours: readonly Behaviour[];
	readonly obligations: readonly Obligation[];
	/** Old-site scripts and what each turned out to be: a framework runtime (converted, never shipped) or plain script (its effects inventoried). */
	readonly scripts: readonly ScriptFacts[];
	/** Every third-party embed the pages carry, per provider, with what the migration does with it. */
	readonly embeds?: readonly EmbedUse[];
	/** The DocSearch (Algolia) search the pages run, read from their scripts or the theme's config: convert gives it to the docsearch part. */
	readonly docsearch?: { readonly appId: string; readonly apiKey: string; readonly indexName: string };
	readonly limits: readonly string[];
}

export interface ScriptFacts {
	/** URL path, or `inline:<sha8>` with the first route it is on. */
	readonly script: string;
	readonly routes: readonly string[];
	readonly bytes: number;
	readonly runtime?: string;
	readonly effects: number;
	readonly parsed: boolean;
}

export interface Coverage {
	readonly used: number;
	readonly implemented: number;
	readonly checked: number;
	readonly obligations: { readonly total: number; readonly checkable: number };
	readonly byLibrary: readonly { readonly library: string; readonly used: number; readonly implemented: number; readonly checked: number }[];
}
