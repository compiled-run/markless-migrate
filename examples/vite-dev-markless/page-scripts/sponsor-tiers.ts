interface Sponsor {
	readonly name: string | null;
	readonly url: string;
	readonly img: string;
}

type Size = 'big' | 'medium';

const SIZES: Record<Size, { readonly columns: number; readonly padding: string; readonly logoSize: string }> = {
	big: { columns: 3, padding: 'py-16', logoSize: 'h-13 w-[220px]' },
	medium: { columns: 5, padding: 'py-7', logoSize: 'h-8 w-[120px]' },
};

const GRID: Record<number, string> = {
	1: 'grid-cols-1',
	2: 'grid-cols-1 sm:grid-cols-2',
	3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
	4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
	5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
};

interface Tier {
	readonly tier: string;
	readonly gridClass: string;
	readonly linkClass: string;
	readonly logoClass: string;
	readonly emptyClass: string;
	readonly items: readonly Sponsor[];
	readonly empty: readonly number[];
}

function tier(name: string, size: Size, items: readonly Sponsor[]): Tier {
	const { columns, padding, logoSize } = SIZES[size];
	const cols = Math.min(columns, items.length);
	const remainder = items.length % cols;
	return {
		tier: name,
		gridClass: `grid *:border-r *:border-b *:border-nickel ${GRID[cols] ?? 'grid-cols-1'}`,
		linkClass: `spsr-link flex items-center justify-center px-8 transition-opacity opacity-85 hover:opacity-100 ${padding}`,
		logoClass: `spsr-logo object-contain ${logoSize}`,
		emptyClass: `spsr-link flex items-center justify-center px-8 ${padding}`,
		items,
		empty: Array.from({ length: remainder === 0 ? 0 : cols - remainder }, (_, i) => i),
	};
}

// As Vue binds them: a null attribute is left out and null text is empty.
function el(tag: string, attributes: Record<string, string | null>, children: readonly (Node | string | null)[] = []): HTMLElement {
	const node = document.createElement(tag);
	node.setAttribute('data-v-755ff878', '');
	for (const [name, value] of Object.entries(attributes)) if (value !== null) node.setAttribute(name, value);
	node.append(...children.map((child) => child ?? ''));
	return node;
}

const render = (tiers: readonly Tier[]) =>
	el(
		'div',
		{ class: 'wrapper' },
		tiers.map((t) =>
			el('div', { class: 'border-t border-nickel' }, [
				el('div', { class: 'py-5 px-5 sm:px-10 border-b border-nickel' }, [el('span', { class: 'text-white/70 text-xs font-mono uppercase tracking-wide' }, [t.tier])]),
				el('div', { class: t.gridClass }, [
					...t.items.map((s) =>
						el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', class: t.linkClass }, [
							el('img', { src: s.img, alt: s.name, class: t.logoClass, loading: 'lazy' }),
							el('span', { class: 'spsr-name ml-5' }, [s.name]),
						]),
					),
					...t.empty.map(() => el('div', { class: t.emptyClass, 'aria-hidden': 'true' })),
				]),
			]),
		),
	);

// The home page shows every tier but "Brought to you by", which the hero's VoidZero card already credits.
export async function loadSponsorTiers(after: Element): Promise<void> {
	const response = await fetch('https://sponsors.vite.dev/sponsors.json');
	const sponsors = (await response.json()) as Record<'partnership' | 'platinum' | 'gold', Sponsor[]>;
	after.after(render([tier('In partnership with', 'big', sponsors.partnership), tier('Platinum Sponsors', 'big', sponsors.platinum), tier('Gold Sponsors', 'medium', sponsors.gold)]));
}
