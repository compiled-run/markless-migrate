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
			const request = fetch(`https://api.iconify.design/${prefix}.json?${new URLSearchParams({ icons: missing.join(',') })}`).then(
				(response) => response.json() as Promise<IconSet>,
			);
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
