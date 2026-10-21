// @iconify/vue's contract: the server sends empty 16x16 placeholders, the browser fetches each icon set's data and fills them.
interface Icon {
	readonly body: string;
	readonly width?: number;
	readonly height?: number;
}
interface IconSet {
	readonly width?: number;
	readonly height?: number;
	readonly icons: Record<string, Icon>;
}

// @iconify/vue keeps every icon it has loaded, so a page shown later asks only for icons it has not seen.
const loaded = new Map<string, Promise<{ readonly set: IconSet; readonly icon?: Icon }>>();

// @iconify/vue's API redundancy: the two fallback hosts in a random order after the main one; a host that has not
// answered in 750 ms gets the next one asked too, the first answer wins, and the host that gave it is asked first next time.
const fallbacks = ['https://api.simplesvg.com', 'https://api.unisvg.com'];
const hosts = ['https://api.iconify.design'];
while (fallbacks.length) hosts.push((fallbacks.length === 1 || Math.random() > 0.5 ? fallbacks.shift() : fallbacks.pop())!);
let first = 0;

function query(path: string): Promise<IconSet> {
	return new Promise((resolve, reject) => {
		const order = hosts.map((_, i) => (first + i) % hosts.length);
		let pending = 0;
		let done = false;
		let timer: number | undefined;
		const end = (error?: unknown, set?: IconSet, host?: number) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (error === undefined) {
				first = host!;
				resolve(set!);
			} else reject(error);
		};
		const next = () => {
			if (done) return;
			clearTimeout(timer);
			const host = order.shift();
			if (host === undefined) {
				if (pending) timer = window.setTimeout(() => end(new Error('timeout')), 5000);
				else end(new Error('no host answered'));
				return;
			}
			pending++;
			fetch(hosts[host] + path)
				.then(async (response) => {
					if (response.status === 404) return end(new Error('404'));
					const data = response.status === 200 ? ((await response.json()) as unknown) : null;
					if (typeof data !== 'object' || data === null) throw new Error(String(response.status));
					end(undefined, data as IconSet, host);
				})
				.catch(() => {
					pending--;
					// A failed host passes the query on at once, unless another host is still answering.
					if (!pending) next();
				});
			timer = window.setTimeout(next, 750);
		};
		next();
	});
}

function fill(svg: SVGSVGElement, prefix: string, set: IconSet, icon: Icon): void {
	svg.setAttribute('viewBox', `0 0 ${icon.width ?? set.width ?? 16} ${icon.height ?? set.height ?? 16}`);
	const rest = svg.getAttribute('class');
	svg.setAttribute('class', `iconify iconify--${prefix}${rest ? ` ${rest}` : ''}`);
	svg.innerHTML = icon.body;
	svg.removeAttribute('data-icon');
}

export function loadIcons(): void {
	const sets = new Map<string, SVGSVGElement[]>();
	for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-icon]')) {
		const prefix = svg.dataset.icon!.split(':')[0]!;
		sets.set(prefix, [...(sets.get(prefix) ?? []), svg]);
	}
	for (const [prefix, svgs] of sets) {
		const names = [...new Set(svgs.map((svg) => svg.dataset.icon!.split(':')[1]!))].sort();
		const missing = names.filter((name) => !loaded.has(`${prefix}:${name}`));
		if (missing.length) {
			const request = query(`/${prefix}.json?${new URLSearchParams({ icons: missing.join(',') })}`);
			for (const name of missing)
				loaded.set(
					`${prefix}:${name}`,
					request.then((set) => ({ set, icon: set.icons[name] })),
				);
		}
		for (const svg of svgs)
			void loaded.get(svg.dataset.icon!)!.then(
				({ set, icon }) => {
					if (icon && svg.dataset.icon) fill(svg, prefix, set, icon);
				},
				() => {},
			);
	}
}
