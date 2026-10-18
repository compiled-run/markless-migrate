export interface Sponsor {
	readonly name: string;
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

export interface Tier {
	readonly tier: string;
	readonly gridClass: string;
	readonly linkClass: string;
	readonly logoClass: string;
	readonly emptyClass: string;
	readonly items: readonly Sponsor[];
	readonly empty: readonly { readonly key: number }[];
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
		empty: Array.from({ length: remainder === 0 ? 0 : cols - remainder }, (_, i) => ({ key: i + 1 })),
	};
}

// The home page shows every tier but "Brought to you by", which the hero's VoidZero card already credits.
export async function loadSponsorTiers(): Promise<readonly Tier[]> {
	const response = await fetch('https://sponsors.vite.dev/sponsors.json');
	const sponsors = (await response.json()) as Record<'partnership' | 'platinum' | 'gold', Sponsor[]>;
	return [tier('In partnership with', 'big', sponsors.partnership), tier('Platinum Sponsors', 'big', sponsors.platinum), tier('Gold Sponsors', 'medium', sponsors.gold)];
}
