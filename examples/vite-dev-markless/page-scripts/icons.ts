// @iconify/vue's contract: the server sends empty 16x16 placeholders, the browser fetches each icon set's data and fills them.
interface IconSet {
	readonly width?: number;
	readonly height?: number;
	readonly icons: Record<string, { readonly body: string; readonly width?: number; readonly height?: number }>;
}

export function loadIcons(): void {
	const sets = new Map<string, SVGSVGElement[]>();
	for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-icon]')) {
		const prefix = svg.dataset.icon!.split(':')[0]!;
		sets.set(prefix, [...(sets.get(prefix) ?? []), svg]);
	}
	for (const [prefix, svgs] of sets) {
		const names = [...new Set(svgs.map((svg) => svg.dataset.icon!.split(':')[1]!))].sort();
		void fetch(`https://api.iconify.design/${prefix}.json?${new URLSearchParams({ icons: names.join(',') })}`)
			.then((response) => response.json() as Promise<IconSet>)
			.then(
				(set) => {
					for (const svg of svgs) {
						const icon = set.icons[svg.dataset.icon!.split(':')[1]!];
						if (!icon) continue;
						svg.setAttribute('viewBox', `0 0 ${icon.width ?? set.width ?? 16} ${icon.height ?? set.height ?? 16}`);
						const rest = svg.getAttribute('class');
						svg.setAttribute('class', `iconify iconify--${prefix}${rest ? ` ${rest}` : ''}`);
						svg.innerHTML = icon.body;
						svg.removeAttribute('data-icon');
					}
				},
				() => {},
			);
	}
}
