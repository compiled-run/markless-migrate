// Which longhands a declaration sets, so two declarations compete only when those overlap. A logical property stands for
// every physical side or axis it can map to, since writing-mode and direction decide which.

const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const sides = (prefix: string, suffix = '') => SIDES.map((s) => `${prefix}${s}${suffix}`);
const BORDER_SIDE = ['width', 'style', 'color'];
const BORDER_IMAGE = ['border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat'];
const MASK_BORDER = ['mask-border-source', 'mask-border-slice', 'mask-border-width', 'mask-border-outset', 'mask-border-repeat', 'mask-border-mode'];
const FONT_VARIANT = ['font-variant-ligatures', 'font-variant-caps', 'font-variant-numeric', 'font-variant-east-asian', 'font-variant-alternates', 'font-variant-position', 'font-variant-emoji'];

const SHORTHANDS: Record<string, readonly string[]> = {
	animation: ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state', 'animation-timeline', 'animation-composition', 'animation-range-start', 'animation-range-end', 'animation-trigger'],
	'animation-range': ['animation-range-start', 'animation-range-end'],
	background: ['background-image', 'background-position-x', 'background-position-y', 'background-size', 'background-repeat-x', 'background-repeat-y', 'background-attachment', 'background-origin', 'background-clip', 'background-color', 'background-blend-mode'],
	'background-position': ['background-position-x', 'background-position-y'],
	'background-repeat': ['background-repeat-x', 'background-repeat-y'],
	border: [...SIDES.flatMap((s) => BORDER_SIDE.map((p) => `border-${s}-${p}`)), ...BORDER_IMAGE],
	...Object.fromEntries(SIDES.map((s) => [`border-${s}`, BORDER_SIDE.map((p) => `border-${s}-${p}`)])),
	...Object.fromEntries(BORDER_SIDE.map((p) => [`border-${p}`, sides('border-', `-${p}`)])),
	'border-radius': CORNERS.map((c) => `border-${c}-radius`),
	'border-image': BORDER_IMAGE,
	'column-rule': ['column-rule-width', 'column-rule-style', 'column-rule-color'],
	columns: ['column-width', 'column-count'],
	'contain-intrinsic-size': ['contain-intrinsic-width', 'contain-intrinsic-height'],
	container: ['container-name', 'container-type'],
	flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
	'flex-flow': ['flex-direction', 'flex-wrap'],
	font: ['font-style', ...FONT_VARIANT, 'font-weight', 'font-stretch', 'font-width', 'font-size', 'line-height', 'font-family', 'font-size-adjust', 'font-kerning', 'font-optical-sizing', 'font-language-override', 'font-feature-settings', 'font-variation-settings', 'font-palette'],
	'font-variant': FONT_VARIANT,
	'font-synthesis': ['font-synthesis-weight', 'font-synthesis-style', 'font-synthesis-small-caps', 'font-synthesis-position'],
	gap: ['row-gap', 'column-gap'],
	grid: ['grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow', 'row-gap', 'column-gap'],
	'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
	'grid-area': ['grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end'],
	'grid-row': ['grid-row-start', 'grid-row-end'],
	'grid-column': ['grid-column-start', 'grid-column-end'],
	inset: SIDES,
	'interest-delay': ['interest-delay-start', 'interest-delay-end'],
	'line-clamp': ['line-clamp', 'max-lines', 'block-ellipsis', 'continue'],
	'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
	margin: sides('margin-'),
	padding: sides('padding-'),
	'scroll-margin': sides('scroll-margin-'),
	'scroll-padding': sides('scroll-padding-'),
	mask: ['mask-image', 'mask-mode', 'mask-repeat', 'mask-position-x', 'mask-position-y', 'mask-clip', 'mask-origin', 'mask-size', 'mask-composite', ...MASK_BORDER],
	'mask-border': MASK_BORDER,
	'mask-position': ['mask-position-x', 'mask-position-y'],
	offset: ['offset-position', 'offset-path', 'offset-distance', 'offset-rotate', 'offset-anchor'],
	outline: ['outline-color', 'outline-style', 'outline-width'],
	overflow: ['overflow-x', 'overflow-y'],
	'overscroll-behavior': ['overscroll-behavior-x', 'overscroll-behavior-y'],
	'place-content': ['align-content', 'justify-content'],
	'place-items': ['align-items', 'justify-items'],
	'place-self': ['align-self', 'justify-self'],
	'position-try': ['position-try-order', 'position-try-fallbacks'],
	'scroll-timeline': ['scroll-timeline-name', 'scroll-timeline-axis'],
	'view-timeline': ['view-timeline-name', 'view-timeline-axis', 'view-timeline-inset'],
	'text-align': ['text-align', 'text-align-all', 'text-align-last'],
	'text-box': ['text-box-trim', 'text-box-edge'],
	'text-decoration': ['text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness'],
	'text-emphasis': ['text-emphasis-style', 'text-emphasis-color'],
	'text-stroke': ['text-stroke-width', 'text-stroke-color'],
	'text-wrap': ['text-wrap-mode', 'text-wrap-style'],
	'white-space': ['white-space-collapse', 'text-wrap-mode', 'white-space-trim'],
	transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'transition-behavior'],
	marker: ['marker-start', 'marker-mid', 'marker-end'],
	caret: ['caret-color', 'caret-shape', 'caret-animation'],
	'vertical-align': ['vertical-align', 'alignment-baseline', 'baseline-shift', 'baseline-source'],
};

const ALIASES: Record<string, string> = {
	'word-wrap': 'overflow-wrap',
	'grid-gap': 'gap',
	'grid-row-gap': 'row-gap',
	'grid-column-gap': 'column-gap',
	'page-break-before': 'break-before',
	'page-break-after': 'break-after',
	'page-break-inside': 'break-inside',
	'font-stretch': 'font-width',
};

/** A logical property's physical counterparts: each it can be, in any writing mode and direction. */
function physical(p: string): readonly string[] | undefined {
	let m = /^(margin|padding|scroll-margin|scroll-padding|inset)-(inline|block)(?:-(start|end))?$/.exec(p);
	if (m) return m[1] === 'inset' ? SIDES : sides(`${m[1]}-`);
	m = /^border-(inline|block)(?:-(start|end))?(?:-(width|style|color))?$/.exec(p);
	if (m) return m[3] ? sides('border-', `-${m[3]}`) : SIDES.flatMap((s) => BORDER_SIDE.map((x) => `border-${s}-${x}`));
	if (/^border-(?:start|end)-(?:start|end)-radius$/.test(p)) return CORNERS.map((c) => `border-${c}-radius`);
	m = /^(min-|max-)?(inline|block)-size$/.exec(p);
	if (m) return [`${m[1] ?? ''}width`, `${m[1] ?? ''}height`];
	m = /^(overflow|overscroll-behavior)-(inline|block)$/.exec(p);
	if (m) return [`${m[1]}-x`, `${m[1]}-y`];
	if (/^contain-intrinsic-(?:inline|block)-size$/.test(p)) return ['contain-intrinsic-width', 'contain-intrinsic-height'];
	return undefined;
}

/** The longhands `property` sets, logical ones as every physical one they can be; `*` for `all`. Vendor prefixes are dropped. */
export function longhands(property: string): readonly string[] {
	const p = property.toLowerCase();
	if (p.startsWith('--')) return [p];
	const bare = p.replace(/^-(?:webkit|moz|ms|o)-/, '');
	if (bare === 'all') return ['*'];
	const name = ALIASES[bare] ?? bare;
	const expand = (n: string): string[] => {
		const parts = SHORTHANDS[n];
		if (parts) return parts.flatMap((part) => (part === n ? [part] : expand(part)));
		return [...(physical(n) ?? [n])];
	};
	return [...new Set(expand(name))];
}
