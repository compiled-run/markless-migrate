import type { UseSite } from '../usage/types.ts';

/** How the old page brings the embed in. */
export type EmbedForm =
	/** An `<iframe>` (or `<embed>`, `<object>`, `<video>`) from another origin, in the served markup. */
	| 'iframe'
	/** Provider markup a loader script turns into the embed (`blockquote.twitter-tweet` and `widgets.js`). */
	| 'script'
	/** A loader script and no placeholder: the page's own code creates the embed through the provider's JS API. */
	| 'api'
	/** A click-to-load facade the old site already uses (lite-youtube-embed, react-lite-youtube-embed, lite-vimeo). */
	| 'facade'
	/** Provider markup with no loader on the page: the content is already static. */
	| 'markup';

/** What the embed is to a visitor, which decides what activation means. */
export type EmbedKind = 'player' | 'audio' | 'post' | 'button' | 'code' | 'card' | 'map' | 'widget';

/** Why an embed keeps its original form instead of a Markless implementation. */
export type KeepReason = 'live-at-load' | 'autoplay' | 'driven-by-page' | 'auth' | 'terms' | 'ads';

export interface ProviderTerms {
	/** Whether the provider's terms let the migrator read the embed's rendered markup to study it. */
	readonly study: boolean;
	readonly note: string;
	readonly url?: string;
}

export interface Provider {
	readonly id: string;
	readonly name: string;
	readonly kind: EmbedKind;
	/** The address of an embedded frame; the first group is the key (a video id, a post id). */
	readonly frame?: RegExp;
	/** Loader scripts, by address. */
	readonly loaders?: readonly RegExp[];
	/** Placeholder or facade markup: the key of the element, or undefined. */
	readonly markup?: (tag: string, attrs: ReadonlyMap<string, string>) => { readonly key: string; readonly form: 'script' | 'facade' } | undefined;
	/** Where its data comes from at convert time: an oEmbed endpoint or an official API. */
	readonly data?: string;
	/** The element its loader replaces with the embed (or, with `after`, writes the embed after), as a CSS selector. */
	readonly slot?: { readonly selector: string; readonly after?: boolean };
	/** The pre-built Markless component for it, in src/embed/adapters/. */
	readonly adapter?: string;
	/** Set when every use must stay live, with the reason. */
	readonly keep?: { readonly reason: KeepReason; readonly why: string };
	readonly terms: ProviderTerms;
}

/** One embed on one or more old pages. */
export interface EmbedUse {
	/** Stable across plans: `<provider>-<key>`, lower case. It is the `data-markless-embed` value the new app's component carries. */
	readonly id: string;
	readonly provider: string;
	readonly providerName: string;
	readonly kind: EmbedKind;
	readonly form: EmbedForm;
	readonly key: string;
	/** The frame address, the post URL, the repository: what identifies the embed to its provider. */
	readonly url?: string;
	/** The loader scripts the page loads for it. */
	readonly loaders: readonly string[];
	readonly element: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly routes: readonly string[];
	readonly sites: readonly UseSite[];
	readonly adapter?: string;
	readonly keep?: { readonly reason: KeepReason; readonly why: string };
	readonly terms: ProviderTerms;
}

export interface EmbedsFile {
	readonly version: 1;
	readonly generatedAt: string;
	readonly embeds: readonly EmbedUse[];
}
