// Alpine.js's Intersect and Resize plugins, x-intersect and x-resize (MIT, Caleb Porzio).
function threshold(modifiers: readonly string[]): number {
	if (modifiers.includes('full')) return 0.99;
	if (modifiers.includes('half')) return 0.5;
	if (!modifiers.includes('threshold')) return 0;
	const value = modifiers[modifiers.indexOf('threshold') + 1];
	if (value === '100') return 1;
	if (value === '0') return 0;
	return Number(`.${value}`);
}

function rootMargin(modifiers: readonly string[]): string {
	const at = modifiers.indexOf('margin');
	if (at === -1) return '0px 0px 0px 0px';
	const values: (string | undefined)[] = [];
	for (let i = 1; i < 5; i++) values.push(getLengthValue(modifiers[at + i] || ''));
	const kept = values.filter((v) => v !== undefined);
	return kept.length ? kept.join(' ').trim() : '0px 0px 0px 0px';
}

function getLengthValue(raw: string): string | undefined {
	const match = raw.match(/^(-?[0-9]+)(px|%)?$/);
	return match ? match[1]! + (match[2] || 'px') : undefined;
}

/** x-intersect(:enter|:leave): runs the expression when the element enters (or leaves) the viewport. */
export function intersect(el: HTMLElement | undefined, value: '' | 'enter' | 'leave', modifiers: readonly string[], run: () => void): void {
	if (!el) return;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!el.isConnected) return observer.disconnect();
				if (entry.isIntersecting === (value === 'leave')) continue;
				run();
				if (modifiers.includes('once')) observer.disconnect();
			}
		},
		{ rootMargin: rootMargin(modifiers), threshold: threshold(modifiers), root: modifiers.includes('parent') ? el.parentElement : null },
	);
	observer.observe(el);
}

/** x-resize: runs with $width and $height of the element, or of the document with .document. */
export function resize(el: HTMLElement | undefined, modifiers: readonly string[], run: (width: number, height: number) => void): void {
	if (!el) return;
	const target = modifiers.includes('document') ? document.documentElement : el;
	const observer = new ResizeObserver((entries) => {
		if (!el.isConnected) return observer.disconnect();
		const entry = entries.at(-1)!;
		const width = entry.borderBoxSize[0]!.inlineSize;
		const height = entry.borderBoxSize[0]!.blockSize;
		run(width, height);
	});
	observer.observe(target);
}
