// react-textarea-autosize 8.5: an uncontrolled TextareaAutosize measures its value (or placeholder, or 'x') in a hidden
// textarea copying its sizing styles and sets `height: <n>px !important` on change, on window resize, once fonts load
// and after its form resets; the rows run from minRows (1) to maxRows (none). That inline important height, which the
// library writes as it mounts, is how the part knows its textareas. Measuring code from the library (MIT, Andarist).
const HIDDEN: Readonly<Record<string, string>> = { 'min-height': '0', 'max-height': 'none', height: '0', visibility: 'hidden', overflow: 'hidden', position: 'absolute', 'z-index': '-1000', top: '0', right: '0', display: 'block' };
const SIZING = ['borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'boxSizing', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop', 'tabSize', 'textIndent', 'textRendering', 'textTransform', 'width', 'wordBreak', 'wordSpacing', 'scrollbarGutter'] as const;

const isAutosize = (el: Element): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement && el.style.getPropertyPriority('height') === 'important';

let hidden: HTMLTextAreaElement | undefined;
const heights = new WeakMap<HTMLTextAreaElement, number>();

function forceHidden(node: HTMLTextAreaElement): void {
	for (const [key, value] of Object.entries(HIDDEN)) node.style.setProperty(key, value, 'important');
}

function resize(node: HTMLTextAreaElement): void {
	const style = getComputedStyle(node);
	if (style.boxSizing === '') return;
	const padding = parseFloat(style.paddingBottom) + parseFloat(style.paddingTop);
	const border = parseFloat(style.borderBottomWidth) + parseFloat(style.borderTopWidth);
	const borderBox = style.boxSizing === 'border-box';
	if (!hidden) {
		hidden = document.createElement('textarea');
		hidden.setAttribute('tabindex', '-1');
		hidden.setAttribute('aria-hidden', 'true');
		forceHidden(hidden);
	}
	if (!hidden.parentNode) document.body.appendChild(hidden);
	for (const key of SIZING) (hidden.style as unknown as Record<string, string>)[key] = (style as unknown as Record<string, string>)[key] ?? '';
	forceHidden(hidden);
	const measure = () => (borderBox ? hidden!.scrollHeight + border : hidden!.scrollHeight - padding);
	hidden.value = node.value || node.placeholder || 'x';
	let height = measure();
	hidden.value = node.value || node.placeholder || 'x';
	height = measure();
	hidden.value = 'x';
	const row = hidden.scrollHeight - padding;
	height = Math.max(row + (borderBox ? padding + border : 0), height);
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
