// react-remove-scroll as Radix's modal menus and selects mount it: the body's scroll bar is removed with its width kept as
// margin (react-remove-scroll-bar's style, counted on body[data-scroll-locked]), and wheel and touch scrolling outside the
// layer is cancelled. The style element goes in <head>, outside the page Markless renders.
let locks = 0;
let style: HTMLStyleElement | null = null;

function barStyle(): string {
	const cs = getComputedStyle(document.body);
	const parse = (x: string) => parseInt(x || '', 10) || 0;
	const [left, top, right] = [parse(cs.marginLeft), parse(cs.marginTop), parse(cs.marginRight)];
	const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth + right - left);
	const i = '!important';
	return `\n  .with-scroll-bars-hidden {\n   overflow: hidden ${i};\n   padding-right: ${gap}px ${i};\n  }\n  body[data-scroll-locked] {\n    overflow: hidden ${i};\n    overscroll-behavior: contain;\n    position: relative ${i};\n    padding-left: ${left}px;\n    padding-top: ${top}px;\n    padding-right: ${right}px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ${gap}px ${i};\n    \n  }\n  \n  .right-scroll-bar-position {\n    right: ${gap}px ${i};\n  }\n  \n  .width-before-scroll-bar {\n    margin-right: ${gap}px ${i};\n  }\n  \n  .right-scroll-bar-position .right-scroll-bar-position {\n    right: 0 ${i};\n  }\n  \n  .width-before-scroll-bar .width-before-scroll-bar {\n    margin-right: 0 ${i};\n  }\n  \n  body[data-scroll-locked] {\n    --removed-body-scroll-bar-size: ${gap}px;\n  }\n`;
}

function scrollable(el: Element, vertical: boolean, delta: number): boolean {
	const cs = getComputedStyle(el);
	const overflow = vertical ? cs.overflowY : cs.overflowX;
	if (overflow !== 'auto' && overflow !== 'scroll') return false;
	const at = vertical ? el.scrollTop : el.scrollLeft;
	const size = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
	return delta > 0 ? at < size - 1 : at > 0;
}

/** Locks page scroll while `inside` (the layer's nodes) may still scroll; returns the unlock. */
export function lockScroll(inside: readonly Element[]): () => void {
	if (locks === 0 && !style) {
		const el = document.createElement('style');
		el.type = 'text/css';
		el.appendChild(document.createTextNode(barStyle()));
		document.head.appendChild(el);
		style = el;
	}
	locks++;
	const counter = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10);
	document.body.setAttribute('data-scroll-locked', String((isFinite(counter) ? counter : 0) + 1));
	let tx = 0;
	let ty = 0;
	const cancel = (event: Event, dx: number, dy: number) => {
		const target = event.target as Element | null;
		const holder = target && inside.find((n) => n.contains(target));
		if (!holder) return true;
		const vertical = Math.abs(dy) >= Math.abs(dx);
		for (let el: Element | null = target; el; el = el.parentElement) {
			if (scrollable(el, vertical, vertical ? dy : dx)) return false;
			if (el === holder) break;
		}
		return true;
	};
	const onWheel = (e: WheelEvent) => {
		if (!e.ctrlKey && cancel(e, e.deltaX, e.deltaY) && e.cancelable) e.preventDefault();
	};
	const onStart = (e: TouchEvent) => {
		tx = e.changedTouches[0]?.clientX ?? 0;
		ty = e.changedTouches[0]?.clientY ?? 0;
	};
	const onMove = (e: TouchEvent) => {
		const t = e.changedTouches[0];
		if (e.touches.length !== 2 && cancel(e, tx - (t?.clientX ?? 0), ty - (t?.clientY ?? 0)) && e.cancelable) e.preventDefault();
	};
	const opts: AddEventListenerOptions = { passive: false };
	document.addEventListener('wheel', onWheel, opts);
	document.addEventListener('touchmove', onMove, opts);
	document.addEventListener('touchstart', onStart, opts);
	return () => {
		document.removeEventListener('wheel', onWheel);
		document.removeEventListener('touchmove', onMove);
		document.removeEventListener('touchstart', onStart);
		const next = parseInt(document.body.getAttribute('data-scroll-locked') || '0', 10) - 1;
		if (next <= 0) document.body.removeAttribute('data-scroll-locked');
		else document.body.setAttribute('data-scroll-locked', String(next));
		locks--;
		if (locks === 0 && style) {
			document.head.removeChild(style);
			style = null;
		}
	};
}
