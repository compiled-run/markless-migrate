// Plays a demo's recorded uses (convert's ScenePlan): Markless state shows each frame's arms, and this writes the values
// that change inside them, frame by frame at the old page's timing.
type Value = string | number | null;
interface Data {
	readonly listed: string;
	readonly rest: readonly number[];
	readonly edges: readonly (readonly [number, string, number, number, readonly number[], number])[];
	readonly entries: readonly (readonly [number, 'a' | 't' | 'h', string | number, string?])[];
	readonly changes: Readonly<Record<number, readonly (readonly [number, Value])[]>>;
	readonly full: Readonly<Record<number, readonly (readonly [number, Value])[]>>;
}

interface Player {
	readonly region: Element;
	readonly data: Data;
	readonly values: Value[];
	state: number;
	timers: number[];
	/** The use playing: its last frame's state, and the setter of the demo's frame. */
	playing?: { readonly edge: Data['edges'][number]; readonly set: (frame: number) => void };
}

const players = new WeakMap<Element, Player>();

const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;

function controlOf(region: Element, target: Element, listed: string): string | undefined {
	const control = target.closest(listed);
	if (!control || !region.contains(control)) return undefined;
	const sig = sigOf(control);
	let n = 0;
	for (const el of region.querySelectorAll(listed)) {
		if (el === control) return `${sig}#${n}`;
		if (sigOf(el) === sig) n++;
	}
	return undefined;
}

// The k-th run of text among an element's children: adjacent text nodes, with Markless's comments between them, are one.
function setRun(el: Element, run: number, text: string): void {
	let r = -1;
	let inRun = false;
	let wrote = false;
	for (const node of el.childNodes) {
		if (node.nodeType === Node.COMMENT_NODE) continue;
		if (node.nodeType !== Node.TEXT_NODE) {
			inRun = false;
			if (wrote) return;
			continue;
		}
		if (!inRun) {
			r++;
			inRun = true;
		}
		if (r !== run) continue;
		const t = node as Text;
		const next = wrote ? '' : text;
		if (t.data !== next) t.data = next;
		wrote = true;
	}
}

function apply(player: Player, i: number, el: Element): void {
	const [, kind, which, longest] = player.data.entries[i]!;
	const v = player.values[i];
	if (v === undefined) return;
	if (kind === 'h') (el as HTMLElement).hidden = v === 1;
	else if (kind === 't') setRun(el, which as number, typeof v === 'number' ? (longest ?? '').slice(0, v) : (v ?? ''));
	else if (which === '.value') (el as HTMLInputElement).value = typeof v === 'string' ? v : '';
	else if (v === null) el.removeAttribute(which as string);
	else if (el.getAttribute(which as string) !== String(v)) el.setAttribute(which as string, String(v));
}

function write(player: Player, i: number): void {
	for (const el of player.region.querySelectorAll(`[data-mm-k="${player.data.entries[i]![0]}"]`)) apply(player, i, el);
}

function playerOf(region: Element): Player | undefined {
	const known = players.get(region);
	if (known) return known;
	const raw = region.getAttribute('data-mm-scene');
	if (!raw) return undefined;
	const data = JSON.parse(raw) as Data;
	const player: Player = { region, data, values: [], state: 0, timers: [] };
	for (const [i, v] of data.full[data.rest[0]!] ?? []) player.values[i] = v;
	const byKey = new Map<string, number[]>();
	data.entries.forEach(([key], i) => (byKey.get(String(key)) ?? byKey.set(String(key), []).get(String(key))!).push(i));
	// An arm Markless mounts shows its first frame's values: the frame on screen may need others.
	new MutationObserver((records) => {
		for (const r of records)
			for (const added of r.addedNodes) {
				if (!(added instanceof Element)) continue;
				for (const el of [added, ...added.querySelectorAll('[data-mm-k]')]) for (const i of byKey.get(el.getAttribute('data-mm-k') ?? '') ?? []) apply(player, i, el);
			}
	}).observe(region, { childList: true, subtree: true });
	players.set(region, player);
	return player;
}

function show(player: Player, frame: number, set: (frame: number) => void, values: readonly (readonly [number, Value])[]): void {
	for (const [i, v] of values) player.values[i] = v;
	set(frame);
	for (const [i] of values) write(player, i);
}

function settle(player: Player): void {
	const playing = player.playing;
	if (!playing) return;
	for (const t of player.timers) clearTimeout(t);
	player.timers = [];
	const [, , start, end, , to] = playing.edge;
	const rest = player.data.rest[to]!;
	for (let f = start; f <= end; f++) for (const [i, v] of player.data.changes[f] ?? []) player.values[i] = v;
	show(player, rest, playing.set, player.data.full[rest] ?? []);
	player.state = to;
	player.playing = undefined;
}

/** A click in a demo with recorded uses: a listed control plays what it did on the old page from the demo's state. */
export function playScene(event: Event, set: (frame: number) => void): void {
	const target = event.target as Element | null;
	const region = target?.closest('[data-mm-scene]');
	const player = region ? playerOf(region) : undefined;
	if (!player || !target) return;
	const control = controlOf(player.region, target, player.data.listed);
	if (!control) return;
	settle(player);
	const edge = player.data.edges.find(([from, c]) => from === player.state && c === control);
	if (!edge) return;
	const [, , start, end, times] = edge;
	player.playing = { edge, set };
	for (let f = start; f <= end; f++) {
		const frame = f;
		const step = () => {
			show(player, frame, set, player.data.changes[frame] ?? []);
			if (frame === end) settle(player);
		};
		// What the old page changed as the click was handled changes now, in the same task.
		if (times[frame - start]! <= 4 && player.timers.length === 0) step();
		else player.timers.push(window.setTimeout(step, times[frame - start]));
	}
}
