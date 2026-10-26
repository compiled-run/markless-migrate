// HN's comment and profile markup (text, <p>, <a>, <i>, <pre><code>), parsed the way react-render-html's parse5 fragment does, as rows a template can draw.
export interface Inline {
	readonly key: number;
	readonly kind: 'text' | 'a' | 'i' | 'code';
	readonly text: string;
	readonly href: string;
	readonly rel: string;
}

/** A top-level node: an inline run, or a <p> or <pre> holding runs. */
export interface Block {
	readonly key: number;
	readonly kind: 'text' | 'a' | 'i' | 'code' | 'p' | 'pre';
	readonly text: string;
	readonly href: string;
	readonly rel: string;
	readonly inlines: readonly Inline[];
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name[0] === '#')
			return String.fromCodePoint(
				name[1] === 'x' || name[1] === 'X'
					? parseInt(name.slice(2), 16)
					: parseInt(name.slice(1), 10),
			);
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

const attr = (tag: string, name: string): string =>
	decodeEntities(new RegExp(`${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? '');

export function parseHtml(html: string | null | undefined): Block[] {
	const blocks: Block[] = [];
	let block: { kind: 'p' | 'pre'; inlines: Inline[] } | undefined;
	let inline: { kind: Inline['kind']; href: string; rel: string } = {
		kind: 'text',
		href: '',
		rel: '',
	};
	let key = 0;
	const open = (kind: 'p' | 'pre') => {
		block = { kind, inlines: [] };
		blocks.push({ key: key++, kind, text: '', href: '', rel: '', inlines: block.inlines });
	};
	for (const token of (html ?? '').split(/(<[^>]*>)/)) {
		if (!token) continue;
		if (token[0] === '<') {
			const tag = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase();
			const closing = token[1] === '/';
			if (tag === 'p' || tag === 'pre') {
				if (closing) block = undefined;
				else open(tag);
			} else if (tag === 'a')
				inline = closing
					? { kind: 'text', href: '', rel: '' }
					: { kind: 'a', href: attr(token, 'href'), rel: attr(token, 'rel') };
			else if (tag === 'i' || tag === 'code')
				inline = closing
					? { kind: 'text', href: '', rel: '' }
					: { kind: tag, href: '', rel: '' };
			continue;
		}
		const run = {
			key: key++,
			kind: inline.kind,
			text: decodeEntities(token),
			href: inline.href,
			rel: inline.rel,
		};
		if (block) block.inlines.push(run);
		else blocks.push({ ...run, inlines: [] });
	}
	return blocks;
}
