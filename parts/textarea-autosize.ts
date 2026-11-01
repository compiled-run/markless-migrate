// react-textarea-autosize 8.5: an uncontrolled TextareaAutosize measures its value's height and sets `height: <n>px !important` on change, on window resize, once fonts load
// and after its form resets; the rows run from minRows (1) to maxRows (none). That inline important height, which the
// library writes as it mounts, is how the part knows its textareas.
const isAutosize = (el: Element): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement && el.style.getPropertyPriority('height') === 'important';

const heights = new WeakMap<HTMLTextAreaElement, number>();
// Measured on the textarea itself, in one task, where the library uses a hidden copy: a part never inserts page nodes.
const MEASURE: readonly (readonly [string, string])[] = [['min-height', '0'], ['max-height', 'none'], ['height', '0'], ['overflow', 'hidden']];

function resize(node: HTMLTextAreaElement): void {
	const style = getComputedStyle(node);
	if (style.boxSizing === '') return;
	const padding = parseFloat(style.paddingBottom) + parseFloat(style.paddingTop);
	const border = parseFloat(style.borderBottomWidth) + parseFloat(style.borderTopWidth);
	const borderBox = style.boxSizing === 'border-box';
	const line = parseFloat(style.lineHeight);
	const row = Number.isFinite(line) ? line : parseFloat(style.fontSize) * 1.2;
	const saved = MEASURE.map(([key]) => [key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)] as const);
	for (const [key, value] of MEASURE) node.style.setProperty(key, value, 'important');
	const content = node.scrollHeight;
	for (const [key, value, priority] of saved) {
		if (value) node.style.setProperty(key, value, priority);
		else node.style.removeProperty(key);
	}
	const height = Math.max(row + (borderBox ? padding + border : 0), borderBox ? content + border : content - padding);
	if (heights.get(node) === height) return;
	heights.set(node, height);
	node.style.setProperty('height', `${height}px`, 'important');
}

const resizeAll = () => {
	for (const node of document.querySelectorAll('textarea')) if (isAutosize(node)) resize(node);
};

export function input(target: Element): boolean {
	if (isAutosize(target)) resize(target);
	return false;
}

export function idle(): void {
	resizeAll();
	addEventListener('resize', resizeAll);
	document.fonts?.addEventListener('loadingdone', resizeAll);
	document.body.addEventListener('reset', (event) => {
		const form = event.target;
		requestAnimationFrame(() => {
			for (const node of document.querySelectorAll('textarea')) if (isAutosize(node) && node.form === form) resize(node);
		});
	});
}
