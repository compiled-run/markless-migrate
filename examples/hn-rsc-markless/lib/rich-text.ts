import { parseFragment } from 'parse5';

export interface Run {
	readonly id: number;
	readonly kind: 'text' | 'i' | 'a' | 'code';
	readonly text: string;
	readonly href: string;
	readonly rel: string;
}

export interface Block {
	readonly id: number;
	readonly kind: 'top' | 'p' | 'pre';
	readonly runs: readonly Run[];
}

type Parse5Node = {
	nodeName: string;
	value?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: Parse5Node[];
};

const textOf = (node: Parse5Node): string =>
	node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(textOf).join('');

// HN item text is HTML; it is parsed as a browser parses innerHTML, then kept as the blocks and inline runs HN writes.
export function richText(html: string | undefined): readonly Block[] {
	if (!html) return [];
	let next = 0;
	const blocks: Block[] = [];
	let top: Run[] | undefined;
	const run = (node: Parse5Node): Run => {
		const attr = (name: string) => node.attrs?.find((a) => a.name === name)?.value ?? '';
		const kind =
			node.nodeName === 'i' || node.nodeName === 'a' || node.nodeName === 'code'
				? node.nodeName
				: 'text';
		return { id: next++, kind, text: textOf(node), href: attr('href'), rel: attr('rel') };
	};
	for (const node of (parseFragment(html) as Parse5Node).childNodes ?? []) {
		if (node.nodeName === 'p' || node.nodeName === 'pre') {
			top = undefined;
			blocks.push({
				id: next++,
				kind: node.nodeName,
				runs: (node.childNodes ?? []).map(run),
			});
		} else {
			if (!top) blocks.push({ id: next++, kind: 'top', runs: (top = []) });
			top.push(run(node));
		}
	}
	return blocks;
}
