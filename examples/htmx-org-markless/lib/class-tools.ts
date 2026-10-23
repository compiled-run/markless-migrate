// htmx's class-tools extension (www/static/js/class-tools.js) for an element's `classes` or `data-classes` attribute:
// runs separated by `&` start together; within a run, each `add`, `remove` or `toggle` of `class:delay` (default 100ms)
// waits for the operations before it, and a toggle then repeats every `delay`.

// htmx.parseInterval: `ms`, `s` and `m` suffixes; a bare number is milliseconds.
function parseInterval(text: string): number {
	if (text.endsWith('ms')) return Number.parseFloat(text.slice(0, -2));
	if (text.endsWith('s')) return Number.parseFloat(text.slice(0, -1)) * 1000;
	if (text.endsWith('m')) return Number.parseFloat(text.slice(0, -1)) * 60000;
	return Number.parseFloat(text);
}

type Operation = 'add' | 'remove' | 'toggle';

export function runClassTools(element: Element): void {
	const classList = element.getAttribute('classes') ?? element.getAttribute('data-classes');
	if (!classList) return;
	for (const run of classList.split('&')) {
		let at = 0;
		for (const value of run.split(',')) {
			const [operation, definition] = value.trim().split(/\s+/);
			if (!operation || !definition) continue;
			const colon = definition.indexOf(':');
			const cssClass = colon > 0 ? definition.slice(0, colon) : definition;
			const delay = colon > 0 ? parseInterval(definition.slice(colon + 1)) : 100;
			const apply = () => element.classList[operation as Operation](cssClass);
			if (operation === 'toggle') {
				setTimeout(() => setInterval(apply, delay), at);
				at += delay;
			} else {
				at += delay;
				setTimeout(apply, at);
			}
		}
	}
}
