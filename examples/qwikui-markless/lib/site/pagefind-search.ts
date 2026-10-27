// search.tsx's Search on Pagefind, as qwikui.com runs it: the page's own inline script imports /pagefind/pagefind.js when
// it hears `initPagefind`; each input preloads and searches the typed text, reads every result's data, keeps the result's
// best h2-h6 anchor for the text (an h2 or h3 when several match), only /styled/ and /headless/ pages, at most 8.

interface Anchor {
	readonly element: string;
	readonly text: string;
	readonly id: string;
}
interface Pagefind {
	preload(term: string): Promise<void>;
	search(term: string): Promise<{ results: { data(): Promise<{ id: string; url: string; excerpt?: string; anchors?: Anchor[] }> }[] } | null>;
}

/** One stretch of an excerpt: plain text, then the words Pagefind marked after it (empty at the end). */
export interface Run {
	readonly k: number;
	readonly text: string;
	readonly mark: string;
}

export interface Hit {
	readonly url: string;
	readonly section: string;
	readonly heading: string;
	readonly excerpt: readonly Run[];
}

const pagefind = () => (window as unknown as { pagefind?: Pagefind }).pagefind;
let started = false;

/** Asks the page's script to load Pagefind once (SearchModal does it when the dialog first opens). */
export function startPagefind(): void {
	if (started) return;
	started = true;
	window.dispatchEvent(new CustomEvent('initPagefind'));
}

async function ready(): Promise<Pagefind> {
	startPagefind();
	for (;;) {
		const found = pagefind();
		if (found) return found;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : m));

export function runsOf(excerpt: string): Run[] {
	const parts = excerpt.split(/<mark>([\s\S]*?)<\/mark>/);
	const runs: Run[] = [];
	for (let i = 0; i < parts.length; i += 2) runs.push({ k: i / 2, text: decode((parts[i] ?? '').replace(/<[^>]+>/g, '')), mark: decode(parts[i + 1] ?? '') });
	return runs;
}

function best(headings: readonly Anchor[], term: string): Anchor | undefined {
	const t = term.toLowerCase();
	return headings.reduce<Anchor | undefined>((b, current) => {
		const currentMatch = current.text.toLowerCase().includes(t);
		const bestMatch = b?.text.toLowerCase().includes(t) ?? false;
		if (currentMatch && !bestMatch) return current;
		if (!currentMatch && bestMatch) return b;
		if (!currentMatch && !bestMatch) return b ?? current;
		return ['h2', 'h3'].includes(current.element) ? current : b;
	}, headings[0]);
}

/** What the dialog lists for `term`, and whether Pagefind answered with no results at all. */
export async function searchSite(term: string): Promise<{ readonly hits: readonly Hit[]; readonly none: boolean }> {
	const engine = await ready();
	await engine.preload(term);
	const search = await engine.search(term);
	if (!search) return { hits: [], none: true };
	const data = await Promise.all(search.results.map((r) => r.data()));
	const hits = data
		.flatMap((d) => {
			const headings = (d.anchors ?? []).filter((a) => ['h2', 'h3', 'h4', 'h5', 'h6'].includes(a.element));
			const heading = headings.length ? best(headings, term) : undefined;
			return heading ? [{ url: `${d.url}#${heading.id}`, section: d.url.split('/').slice(-2, -1).join(''), heading: heading.text, excerpt: runsOf(d.excerpt ?? '') }] : [];
		})
		.filter((h) => h.url.includes('/styled/') || h.url.includes('/headless/'))
		.slice(0, 8);
	return { hits, none: data.length === 0 };
}

/** The result link the combobox input's highlight points at. */
export function highlightedLink(input: HTMLInputElement): HTMLAnchorElement | null {
	const id = input.getAttribute('aria-activedescendant');
	return id ? (document.getElementById(id)?.closest('a') ?? null) : null;
}

let asked = 0;
/** What `term` shows, or undefined when a later search was asked before this one answered (search.tsx keeps the last one). */
export async function latestSearch(term: string): Promise<{ readonly hits: readonly Hit[]; readonly none: boolean } | undefined> {
	const mine = ++asked;
	const found = term ? await searchSite(term) : { hits: [], none: false };
	return mine === asked ? found : undefined;
}
