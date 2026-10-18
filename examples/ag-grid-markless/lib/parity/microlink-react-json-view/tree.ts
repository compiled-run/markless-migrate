// @microlink/react-json-view 1.27 for the props DetailPanel passes (displayDataTypes, displayObjectSize and
// enableClipboard off, collapsed false, name "data"): the tree it renders, with its inline styles per theme.

type Palette = Record<'base00' | 'base02' | 'base04' | 'base05' | 'base07' | 'base08' | 'base09' | 'base0A' | 'base0B' | 'base0C' | 'base0D' | 'base0E' | 'base0F', string>;

const RJV_DEFAULT: Palette = { base00: 'rgba(0, 0, 0, 0)', base02: 'rgb(235, 235, 235)', base04: 'rgba(0, 0, 0, 0.3)', base05: 'rgb(88, 110, 117)', base07: 'rgb(0, 43, 54)', base08: 'rgb(211, 54, 130)', base09: 'rgb(203, 75, 22)', base0A: 'rgb(220, 50, 47)', base0B: 'rgb(133, 153, 0)', base0C: 'rgb(108, 113, 196)', base0D: 'rgb(88, 110, 117)', base0E: 'rgb(42, 161, 152)', base0F: 'rgb(38, 139, 210)' };
const MONOKAI: Palette = { base00: 'rgb(39, 40, 34)', base02: 'rgb(73, 72, 62)', base04: 'rgb(165, 159, 133)', base05: 'rgb(248, 248, 242)', base07: 'rgb(249, 248, 245)', base08: 'rgb(249, 38, 114)', base09: 'rgb(253, 151, 31)', base0A: 'rgb(244, 191, 117)', base0B: 'rgb(166, 226, 46)', base0C: 'rgb(161, 239, 228)', base0D: 'rgb(102, 217, 239)', base0E: 'rgb(174, 129, 255)', base0F: 'rgb(204, 102, 51)' };

export type Styles = {
	readonly keyVal: string;
	readonly brace: string;
	readonly key: string;
	readonly arrayKey: string;
	readonly colon: string;
	readonly comma: string;
	readonly ellipsis: string;
	readonly expandedIcon: string;
	readonly collapsedIcon: string;
};

export function stylesFor(theme: string): Styles {
	const t = theme === 'monokai' ? MONOKAI : RJV_DEFAULT;
	return {
		keyVal: `padding: 3px 5px 3px 20px; border-left: 1px solid ${t.base02};`,
		brace: `display: inline-block; cursor: pointer; font-weight: bold; color: ${t.base07};`,
		key: `display: inline-block; color: ${t.base07}; letter-spacing: 0.5px; vertical-align: top; opacity: 0.85;`,
		arrayKey: `display: inline-block; color: ${t.base0C}; letter-spacing: 0.5px; vertical-align: top; opacity: 0.85;`,
		colon: `display: inline-block; margin: 0px 5px; color: ${t.base07}; vertical-align: top;`,
		comma: 'display: inline-block; color: rgb(102, 102, 102); font-size: 12px; margin-right: 4px; cursor: default;',
		ellipsis: `display: inline-block; color: ${t.base09}; font-size: 18px; line-height: 10px; cursor: pointer;`,
		expandedIcon: `vertical-align: top; color: ${t.base0D}; height: 1em; width: 1em; padding-left: 2px;`,
		collapsedIcon: `vertical-align: top; color: ${t.base0E}; height: 1em; width: 1em; padding-left: 2px;`,
	};
}

export function rootStyle(theme: string, background: string): string {
	const base = `font-family: "Space Mono", Monaco, Menlo, "Ubuntu Mono", monospace; cursor: default;`;
	return `${base}${background ? ` background-color: ${background};` : ''} position: relative; font-size: 13px; padding: 8px;`;
}

export type JsonNode = {
	readonly id: string;
	readonly object: boolean;
	readonly array: boolean;
	readonly name: string;
	readonly arrayKey: boolean;
	readonly open: string;
	readonly close: string;
	readonly size: number;
	readonly last: boolean;
	readonly valueStyle: string;
	readonly valueText: string;
	readonly string: boolean;
	readonly kids: JsonNode[];
	readonly iconCls: string;
	readonly iconStyle: string;
	readonly iconPath: string;
	readonly pushedHidden: boolean;
	readonly ellipsisHidden: boolean;
	readonly ellipsisStyle: string;
	readonly closeStyle: string;
	readonly objStyle: string;
	readonly varStyle: string;
	readonly keyStyle: string;
	readonly arrayKeyStyle: string;
	readonly objectKeyStyle: string;
	readonly arrayVarStyle: string;
	readonly objectVarStyle: string;
	readonly commaStyle: string;
	readonly stringStyle: string;
	readonly plainStyle: string;
	readonly pushedStyle: string;
	readonly colonStyle: string;
	readonly braceStyle: string;
	readonly objectKeyVarStyle: string;
};

function typeOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	if (typeof value === 'number') return isNaN(value) ? 'nan' : (0 | value) != value ? 'float' : 'integer';
	if (typeof value === 'object') return 'object';
	return typeof value;
}

export const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\f/g, '\\f');

function valueOf(value: unknown, theme: string): { style: string; text: string; string: boolean } {
	const t = theme === 'monokai' ? MONOKAI : RJV_DEFAULT;
	switch (typeOf(value)) {
		case 'string':
			return { style: `display: inline-block; color: ${t.base09};`, text: `"${escape(value as string)}"`, string: true };
		case 'integer':
			return { style: `display: inline-block; color: ${t.base0F};`, text: String(value), string: false };
		case 'float':
			return { style: `display: inline-block; color: ${t.base0B};`, text: String(value), string: false };
		case 'boolean':
			return { style: `display: inline-block; color: ${t.base0E};`, text: String(value), string: false };
		case 'null':
			return { style: `display: inline-block; color: ${t.base0A}; font-size: 11px; font-weight: bold; background-color: ${t.base02}; padding: 1px 2px; border-radius: 3px;`, text: 'NULL', string: false };
		default:
			return { style: '', text: JSON.stringify(value) ?? '', string: false };
	}
}

/** The rendered tree for `src` named `name`: an object node per object or array, a variable row per value.
 * `toggled` lists the ids of nodes clicked an odd number of times (expanded unless empty, until toggled). */
export function buildTree(src: unknown, name: string, theme: string, toggled: string): JsonNode {
	const styles = stylesFor(theme);
	const flipped = new Set(toggled ? toggled.split('\u0001') : []);
	const build = (value: unknown, key: string, id: string, arrayKey: boolean, last: boolean): JsonNode => {
		const type = typeOf(value);
		if (type === 'object' || type === 'array') {
			const keys = Object.keys(value as object);
			const kids = keys.map((k, i) => build((value as Record<string, unknown>)[k], k, `${id}.${k}`, type === 'array', i === keys.length - 1));
			const expanded = (keys.length > 0) !== flipped.has(id);
			return {
				id, object: true, array: type === 'array', name: key, arrayKey, open: type === 'array' ? '[' : '{', close: type === 'array' ? ']' : '}', size: keys.length, last, valueStyle: '', valueText: '', string: false, kids,
				iconCls: expanded ? 'expanded-icon' : 'collapsed-icon',
				iconStyle: expanded ? styles.expandedIcon : styles.collapsedIcon,
				iconPath: expanded ? 'M0 5l6 6 6-6z' : 'M0 14l6-6-6-6z',
				pushedHidden: !expanded,
				ellipsisHidden: expanded || keys.length === 0,
				ellipsisStyle: expanded || keys.length === 0 ? 'display: none;' : styles.ellipsis,
				closeStyle: `${styles.brace} padding-left: ${expanded ? 3 : 0}px;`,
				...shape(true, arrayKey, last, false, !expanded),
			};
		}
		const v = valueOf(value, theme);
		return { id, object: false, array: false, name: key, arrayKey, open: '', close: '', size: 0, last, valueStyle: v.style, valueText: v.text, string: v.string, kids: [], iconCls: '', iconStyle: '', iconPath: '', pushedHidden: true, ellipsisHidden: true, ellipsisStyle: 'display: none;', closeStyle: '', ...shape(false, arrayKey, last, v.string, true) };
	};
	// Every node renders both rjv shapes (an object row and a variable row) with the other one hidden: one
	// component with nested @for loops, because an @if inside a @for row does not update (see the log).
	const NONE = 'display: none;';
	const shape = (object: boolean, arrayKey: boolean, last: boolean, string: boolean, collapsed: boolean) => ({
		objStyle: object ? styles.keyVal : NONE,
		varStyle: object ? NONE : styles.keyVal,
		keyStyle: arrayKey ? styles.arrayKey : styles.key,
		arrayKeyStyle: arrayKey ? '' : NONE,
		objectKeyStyle: arrayKey ? NONE : '',
		arrayVarStyle: arrayKey ? styles.arrayKey : NONE,
		objectVarStyle: arrayKey ? NONE : '',
		commaStyle: last ? NONE : styles.comma,
		stringStyle: string ? 'cursor: default; word-break: break-all;' : NONE,
		plainStyle: string ? NONE : '',
		pushedStyle: collapsed ? NONE : '',
		colonStyle: styles.colon,
		braceStyle: styles.brace,
		objectKeyVarStyle: styles.key,
	});
	return build(src, name, name, false, true);
}

export function toggle(toggled: string, id: string): string {
	const list = toggled ? toggled.split('\u0001') : [];
	return (list.includes(id) ? list.filter((t) => t !== id) : [...list, id]).join('\u0001');
}

export function docsFor(row: { serialNumber: number; args: unknown } | null | undefined, name: string, theme: string, toggled: string): { id: string; tree: JsonNode }[] {
	return docsOf(String(row?.serialNumber ?? 0), row?.args ?? [], name, theme, toggled);
}

export function docsOf(id: string, src: unknown, name: string, theme: string, toggled: string): { id: string; tree: JsonNode }[] {
	return [{ id, tree: buildTree(src ?? [], name ?? 'data', theme ?? 'rjv-default', toggled ?? '') }];
}

export function treeFor(row: { serialNumber: number; args: unknown } | null | undefined, name: string, theme: string, toggled: string): JsonNode {
	return docsFor(row, name, theme, toggled)[0]!.tree;
}

export function kidsFor(row: { serialNumber: number; args: unknown } | null | undefined, name: string, theme: string, toggled: string): JsonNode[] {
	return docsFor(row, name, theme, toggled)[0]!.tree.kids;
}
