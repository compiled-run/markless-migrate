// react-medium-image-zoom 5.4.9 (Uncontrolled, default props), the library's own rules on the server-rendered wrap:
// once the image has loaded it gets the ghost zoom button and a dialog in body > [data-rmiz-portal]; zooming animates
// the dialog's copy of the image from the image's box to the viewport centre, unzooming back, then closes the dialog.
type ModalState = 'UNLOADED' | 'LOADING' | 'LOADED' | 'UNLOADING';
type Style = { top: number; left: number; width: number; height: number; transform: string; transitionDuration?: string };

const IMAGE_QUERY = ['img', 'svg', '[role="img"]', '[data-zoom]'].map((x) => `${x}:not([aria-hidden="true"])`).join(',');
const SVG = 'http://www.w3.org/2000/svg';
const UNZOOM_PATH = 'M 14.144531 1.148438 L 9 6.292969 L 9 3 L 8 3 L 8 8 L 13 8 L 13 7 L 9.707031 7 L 14.855469 1.851563 Z M 8 8 L 3 8 L 3 9 L 6.292969 9 L 1.148438 14.144531 L 1.851563 14.855469 L 7 9.707031 L 7 13 L 8 13 Z';
const ZOOM_PATH = 'M 9 1 L 9 2 L 12.292969 2 L 2 12.292969 L 2 9 L 1 9 L 1 14 L 6 14 L 6 13 L 2.707031 13 L 13 2.707031 L 13 6 L 14 6 L 14 1 Z';
const A11Y_ZOOM = 'Expand image';
const A11Y_UNZOOM = 'Minimize image';
const SWIPE_THRESHOLD = 10;
const OFFSET = 0;

const tag = (el: Element | null, name: string) => el !== null && el.tagName.toUpperCase() === name;
const testDiv = (el: Element | null) => tag(el, 'DIV') || tag(el, 'SPAN');
const testImg = (el: Element | null): el is HTMLImageElement => tag(el, 'IMG');
const testSvg = (el: Element | null) => tag(el, 'SVG');
const testImgLoaded = (el: HTMLImageElement) => el.complete && el.naturalHeight !== 0;

function getImgSrc(el: Element | null): string | undefined {
	if (testImg(el)) return el.currentSrc === '' ? undefined : el.currentSrc;
	if (el && testDiv(el)) {
		const bg = getComputedStyle(el).backgroundImage;
		if (bg !== '') return /url(?:\(['"]?)(?<url>.*?)(?:['"]?\))/.exec(bg)?.[1];
	}
	return undefined;
}
const getImgAlt = (el: Element | null) => (el === null ? undefined : testImg(el) ? el.alt : (el.getAttribute('aria-label') ?? undefined));

function getStyleGhost(el: Element | null): Record<string, number> {
	if (el === null) return {};
	if (testSvg(el)) {
		const rect = el.getBoundingClientRect();
		const parent = el.parentElement;
		if (parent === null) return { height: rect.height, left: rect.left, width: rect.width, top: rect.top };
		const p = parent.getBoundingClientRect();
		return { height: rect.height, left: p.left - rect.left, top: p.top - rect.top, width: rect.width };
	}
	const h = el as HTMLElement;
	return { height: h.offsetHeight, left: h.offsetLeft, width: h.offsetWidth, top: h.offsetTop };
}

const scaleToWindow = (height: number, width: number) => Math.min((innerWidth - OFFSET * 2) / width, (innerHeight - OFFSET * 2) / height);
function getScale(containerHeight: number, containerWidth: number, scalable: boolean, targetHeight: number, targetWidth: number): number {
	if (containerHeight === 0 || containerWidth === 0) return 1;
	if (!scalable && targetHeight !== 0 && targetWidth !== 0) {
		const scale = scaleToWindow(targetHeight, targetWidth);
		const ratio = targetWidth > targetHeight ? targetWidth / containerWidth : targetHeight / containerHeight;
		return scale > 1 ? ratio : scale * ratio;
	}
	return scaleToWindow(containerHeight, containerWidth);
}
const parsePosition = (position: string, relative: number) => (position.endsWith('%') ? (relative * parseFloat(position)) / 100 : parseFloat(position));
type Box = { top: number; left: number; width: number; height: number; initialTransform: string };
function positioned(c: DOMRect, scalable: boolean, position: string, th: number, tw: number, vh: number, vw: number): Box {
	const [px = '50%', py = '50%'] = position.split(' ');
	const scale = getScale(vh, vw, scalable, th, tw);
	return { top: c.top + parsePosition(py, c.height - vh), left: c.left + parsePosition(px, c.width - vw), width: vw * scale, height: vh * scale, initialTransform: `translate(0,0) scale(${1 / scale})` };
}
function getStyleModalImg(target: Element, imgSrc: string | undefined, isSvg: boolean, isZoomed: boolean, loaded: HTMLImageElement | undefined, shouldRefresh: boolean): Style {
	const scalable = isSvg || imgSrc?.slice(0, 18) === 'data:image/svg+xml' || (imgSrc !== undefined && /\.svg$/i.test(imgSrc));
	const c = target.getBoundingClientRect();
	const cs = getComputedStyle(target);
	const isDivImg = loaded != null && testDiv(target);
	const th = loaded?.naturalHeight ? loaded.naturalHeight : c.height;
	const tw = loaded?.naturalWidth ? loaded.naturalWidth : c.width;
	let pos: Box;
	if (isDivImg) {
		const size = cs.backgroundSize;
		if (size === 'cover' || size === 'contain') {
			const ratio = (size === 'cover' ? Math.max : Math.min)(c.width / tw, c.height / th);
			pos = positioned(c, scalable, cs.backgroundPosition, th, tw, th * ratio, tw * ratio);
		} else if (size === 'auto') pos = positioned(c, scalable, cs.backgroundPosition, th, tw, th, tw);
		else {
			const [sw = '50%', sh = '50%'] = size.split(' ');
			const ratio = Math.min(parsePosition(sw, c.width) / tw, parsePosition(sh, c.height) / th);
			pos = positioned(c, scalable, cs.backgroundPosition, th, tw, th * ratio, tw * ratio);
		}
	} else if (loaded != null) {
		let fit = cs.objectFit;
		if (fit === 'scale-down') fit = tw <= c.width && th <= c.height ? 'none' : 'contain';
		if (fit === 'cover' || fit === 'contain') {
			const ratio = (fit === 'cover' ? Math.max : Math.min)(c.width / tw, c.height / th);
			pos = positioned(c, scalable, cs.objectPosition, th, tw, th * ratio, tw * ratio);
		} else if (fit === 'none') pos = positioned(c, scalable, cs.objectPosition, th, tw, th, tw);
		else {
			const ratio = Math.max(c.width / tw, c.height / th);
			const scale = getScale(th * ratio, tw * ratio, scalable, th, tw);
			pos = { top: c.top, left: c.left, width: c.width * scale, height: c.height * scale, initialTransform: `translate(0,0) scale(${1 / scale})` };
		}
	} else {
		const scale = getScale(c.height, c.width, scalable, th, tw);
		pos = { top: c.top, left: c.left, width: c.width * scale, height: c.height * scale, initialTransform: `translate(0,0) scale(${1 / scale})` };
	}
	const user = cs.transform;
	let centered = '';
	if (user !== 'none' && user !== '') centered = `translate(${pos.width / 2}px,${pos.height / 2}px) ${user} translate(${-pos.width / 2}px,${-pos.height / 2}px)`;
	let transform: string;
	if (!isZoomed) transform = centered === '' ? pos.initialTransform : `${pos.initialTransform} ${centered}`;
	else {
		const base = `translate(${innerWidth / 2 - (pos.left + pos.width / 2)}px,${innerHeight / 2 - (pos.top + pos.height / 2)}px) scale(1)`;
		transform = centered === '' ? base : `${base} ${centered}`;
	}
	const result: Style = { top: pos.top, left: pos.left, width: pos.width, height: pos.height, transform };
	if (isZoomed && shouldRefresh) result.transitionDuration = '0.01ms';
	return result;
}

function icon(kind: 'zoom' | 'unzoom'): SVGSVGElement {
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute(`data-rmiz-btn-${kind}-icon`, 'true');
	svg.setAttribute('fill', 'currentColor');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('xmlns', SVG);
	const path = document.createElementNS(SVG, 'path');
	path.setAttribute('d', kind === 'zoom' ? ZOOM_PATH : UNZOOM_PATH);
	svg.append(path);
	return svg;
}
function portal(): Element {
	const existing = document.querySelector('[data-rmiz-portal]');
	if (existing) return existing;
	const el = document.createElement('div');
	el.setAttribute('data-rmiz-portal', '');
	document.body.appendChild(el);
	return el;
}
const px = (n: number) => `${n}px`;

class Zoom {
	private readonly content: HTMLElement;
	private imgEl: Element | null = null;
	private id = '';
	private loadedImgEl: HTMLImageElement | undefined;
	private modalState: ModalState = 'UNLOADED';
	private shouldRefresh = false;
	private isZoomed = false;
	private isScaling = false;
	private touchYStart: number | undefined;
	private prevBody = { overflow: '', width: '' };
	private timeoutTransitionEnd: ReturnType<typeof setTimeout> | undefined;
	private ghost: HTMLElement | null = null;
	private dialog: HTMLDialogElement | null = null;
	private overlay: HTMLElement | null = null;
	private modalContent: HTMLElement | null = null;
	private modalImg: HTMLImageElement | null = null;
	private contentChange: MutationObserver | undefined;
	private contentNotFound: MutationObserver | undefined;

	constructor(private readonly wrap: HTMLElement) {
		this.content = wrap.querySelector(':scope > [data-rmiz-content]')!;
		const gen4 = () => Math.random().toString(16).slice(-4);
		this.id = gen4() + gen4() + gen4();
		this.setAndTrackImg();
		this.handleImgLoad();
		this.render();
	}

	private setAndTrackImg = (): void => {
		this.imgEl = this.content.querySelector(IMAGE_QUERY);
		if (this.imgEl !== null) {
			this.contentNotFound?.disconnect();
			this.imgEl.addEventListener('load', this.handleImgLoad);
			this.imgEl.addEventListener('click', this.handleZoom);
			if (this.loadedImgEl == null) this.handleImgLoad();
			new ResizeObserver(([entry]) => {
				if (entry?.target !== undefined) {
					this.imgEl = entry.target;
					this.render();
				}
			}).observe(this.imgEl);
			if (this.contentChange == null) {
				this.contentChange = new MutationObserver(() => this.render());
				this.contentChange.observe(this.content, { attributes: true, childList: true, subtree: true });
			}
		} else if (this.contentNotFound == null) {
			this.contentNotFound = new MutationObserver(this.setAndTrackImg);
			this.contentNotFound.observe(this.content, { childList: true, subtree: true });
		}
	};

	private handleImgLoad = (): void => {
		const src = getImgSrc(this.imgEl);
		if (src == null || src === '') return;
		const img = new Image();
		const el = this.imgEl;
		if (testImg(el)) {
			img.sizes = el.sizes;
			img.srcset = el.srcset;
			img.crossOrigin = el.crossOrigin;
		}
		img.src = src;
		const setLoaded = () => {
			this.loadedImgEl = img;
			this.render();
		};
		img.decode().then(setLoaded).catch(() => {
			if (testImgLoaded(img)) return setLoaded();
			img.onload = setLoaded;
		});
	};

	private hasImage(): boolean {
		return this.imgEl !== null && (this.loadedImgEl !== undefined || testSvg(this.imgEl)) && getComputedStyle(this.imgEl).display !== 'none';
	}

	private handleZoom = (): void => {
		if (!this.hasImage() || this.isZoomed) return;
		this.isZoomed = true;
		this.bodyScrollDisable();
		this.dialog?.showModal();
		this.setModalState('LOADING');
	};
	private handleUnzoom = (): void => {
		if (!this.isZoomed) return;
		this.isZoomed = false;
		this.setModalState('UNLOADING');
	};

	private setModalState(next: ModalState, refresh?: boolean): void {
		const prev = this.modalState;
		this.modalState = next;
		if (refresh !== undefined) this.shouldRefresh = refresh;
		this.render();
		if (prev !== 'LOADING' && next === 'LOADING') {
			this.isScaling = false;
			addEventListener('resize', this.handleResize, { passive: true });
			addEventListener('touchstart', this.handleTouchStart, { passive: true });
			addEventListener('touchmove', this.handleTouchMove, { passive: true });
			addEventListener('touchend', this.handleTouchEnd, { passive: true });
			addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
			document.addEventListener('keydown', this.handleKeyDown, true);
		} else if (prev !== 'LOADED' && next === 'LOADED') {
			addEventListener('wheel', this.handleWheel, { passive: true });
		} else if (prev !== 'UNLOADING' && next === 'UNLOADING') {
			this.ensureImgTransitionEnd();
			removeEventListener('wheel', this.handleWheel);
			removeEventListener('touchstart', this.handleTouchStart);
			removeEventListener('touchmove', this.handleTouchMove);
			removeEventListener('touchend', this.handleTouchEnd);
			removeEventListener('touchcancel', this.handleTouchEnd);
			document.removeEventListener('keydown', this.handleKeyDown, true);
		} else if (prev !== 'UNLOADED' && next === 'UNLOADED') {
			this.bodyScrollEnable();
			removeEventListener('resize', this.handleResize);
			this.dialog?.close();
		}
	}

	private handleImgTransitionEnd = (): void => {
		clearTimeout(this.timeoutTransitionEnd);
		if (this.modalState === 'LOADING') this.setModalState('LOADED');
		else if (this.modalState === 'UNLOADING') this.setModalState('UNLOADED', false);
	};
	private ensureImgTransitionEnd(): void {
		if (this.modalImg === null) return;
		const td = getComputedStyle(this.modalImg).transitionDuration;
		const f = parseFloat(td);
		if (f !== 0 && !Number.isNaN(f)) this.timeoutTransitionEnd = setTimeout(this.handleImgTransitionEnd, f * (td.endsWith('ms') ? 1 : 1000) + 50);
	}
	private handleKeyDown = (e: KeyboardEvent): void => {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		this.handleUnzoom();
	};
	private handleWheel = (e: WheelEvent): void => {
		if (e.ctrlKey || this.isScaling || (visualViewport?.scale ?? 1) > 1) return;
		e.stopPropagation();
		queueMicrotask(this.handleUnzoom);
	};
	private handleTouchStart = (e: TouchEvent): void => {
		if (e.touches.length > 1) {
			this.isScaling = true;
			return;
		}
		const [touch] = e.changedTouches;
		if (e.changedTouches.length === 1 && touch !== undefined) this.touchYStart = touch.screenY;
	};
	private handleTouchMove = (e: TouchEvent): void => {
		const [touch] = e.changedTouches;
		if (this.isScaling || (visualViewport?.scale ?? 1) > 1 || this.touchYStart == null || touch === undefined) return;
		if (Math.abs(this.touchYStart - touch.screenY) > SWIPE_THRESHOLD) {
			this.touchYStart = undefined;
			this.handleUnzoom();
		}
	};
	private handleTouchEnd = (): void => {
		this.touchYStart = undefined;
	};
	private handleResize = (): void => {
		this.shouldRefresh = true;
		this.render();
	};
	private bodyScrollDisable(): void {
		const s = document.body.style;
		this.prevBody = { overflow: s.overflow, width: s.width };
		const width = document.body.clientWidth;
		s.overflow = 'hidden';
		s.width = `${width}px`;
	}
	private bodyScrollEnable(): void {
		const s = document.body.style;
		s.width = this.prevBody.width;
		s.overflow = this.prevBody.overflow;
		this.prevBody = { overflow: '', width: '' };
	}

	private render(): void {
		const { imgEl, modalState } = this;
		const hasImage = this.hasImage();
		const isImg = testImg(imgEl);
		const isSvg = testSvg(imgEl);
		const alt = getImgAlt(imgEl);
		const src = getImgSrc(imgEl);
		const active = modalState === 'LOADING' || modalState === 'LOADED';
		this.contentChange?.disconnect();
		this.content.setAttribute('data-rmiz-content', hasImage ? 'found' : 'not-found');
		const visibility = modalState === 'UNLOADED' ? 'visible' : 'hidden';
		if (this.content.style.visibility !== visibility) this.content.style.visibility = visibility;
		this.contentChange?.takeRecords();
		this.contentChange?.observe(this.content, { attributes: true, childList: true, subtree: true });
		if (!hasImage) return;
		if (!this.ghost) {
			this.ghost = document.createElement('div');
			this.ghost.setAttribute('data-rmiz-ghost', '');
			const button = document.createElement('button');
			button.setAttribute('aria-label', alt ? `${A11Y_ZOOM}: ${alt}` : A11Y_ZOOM);
			button.setAttribute('data-rmiz-btn-zoom', '');
			button.setAttribute('type', 'button');
			button.append(icon('zoom'));
			button.addEventListener('click', this.handleZoom);
			this.ghost.append(button);
			this.content.after(this.ghost);
		}
		const ghost = getStyleGhost(imgEl);
		for (const key of ['height', 'left', 'width', 'top'] as const) if (ghost[key] !== undefined) this.ghost.style[key] = px(ghost[key]);
		if (!this.dialog) this.createDialog(isImg || testDiv(imgEl), isSvg);
		this.overlay!.setAttribute('data-rmiz-modal-overlay', active ? 'visible' : 'hidden');
		const style = getStyleModalImg(imgEl!, src, isSvg, active, this.loadedImgEl, this.shouldRefresh);
		const img = this.modalImg;
		if (img) {
			if (!isSvg) {
				img.setAttribute('height', String(style.height));
				img.setAttribute('width', String(style.width));
			}
			img.style.top = px(style.top);
			img.style.left = px(style.left);
			img.style.width = px(style.width);
			img.style.height = px(style.height);
			img.style.transform = style.transform;
			img.style.transitionDuration = style.transitionDuration ?? '';
			if (isSvg) {
				const svg = (imgEl as SVGSVGElement).cloneNode(true) as SVGSVGElement;
				svg.style.width = px(style.width);
				svg.style.height = px(style.height);
				svg.addEventListener('click', this.handleUnzoom);
				img.firstChild?.remove();
				img.append(svg);
			}
		}
	}

	private createDialog(isImgLike: boolean, isSvg: boolean): void {
		const el = this.imgEl as HTMLImageElement;
		const dialog = document.createElement('dialog');
		dialog.setAttribute('aria-labelledby', `rmiz-modal-img-${this.id}`);
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('data-rmiz-modal', '');
		dialog.setAttribute('id', `rmiz-modal-${this.id}`);
		dialog.setAttribute('role', 'dialog');
		const overlay = document.createElement('div');
		overlay.setAttribute('data-rmiz-modal-overlay', 'hidden');
		const content = document.createElement('div');
		content.setAttribute('data-rmiz-modal-content', '');
		let modalImg: HTMLImageElement | null = null;
		if (isImgLike) {
			modalImg = document.createElement('img');
			modalImg.setAttribute('alt', getImgAlt(el) ?? '');
			if (testImg(el) && el.crossOrigin !== null) modalImg.setAttribute('crossorigin', el.crossOrigin);
			if (testImg(el)) modalImg.setAttribute('sizes', el.sizes);
			const src = getImgSrc(el);
			if (src !== undefined) modalImg.setAttribute('src', src);
			if (testImg(el)) modalImg.setAttribute('srcset', el.srcset);
			modalImg.setAttribute('data-rmiz-modal-img', '');
			modalImg.setAttribute('id', `rmiz-modal-img-${this.id}`);
		} else if (isSvg) {
			modalImg = document.createElement('div') as unknown as HTMLImageElement;
			modalImg.setAttribute('data-rmiz-modal-img', 'true');
		}
		if (modalImg) {
			modalImg.addEventListener('transitionend', this.handleImgTransitionEnd);
			content.append(modalImg);
		}
		const unzoom = document.createElement('button');
		unzoom.setAttribute('aria-label', A11Y_UNZOOM);
		unzoom.setAttribute('data-rmiz-btn-unzoom', '');
		unzoom.setAttribute('type', 'button');
		unzoom.append(icon('unzoom'));
		unzoom.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.handleUnzoom();
		});
		content.append(unzoom);
		dialog.append(overlay, content);
		dialog.addEventListener('click', (e) => {
			if (e.target === content || e.target === modalImg) {
				e.stopPropagation();
				this.handleUnzoom();
			}
		});
		dialog.addEventListener('close', (e) => {
			e.stopPropagation();
			this.handleUnzoom();
		});
		dialog.addEventListener('cancel', (e) => e.preventDefault());
		portal().append(dialog);
		this.dialog = dialog;
		this.overlay = overlay;
		this.modalContent = content;
		this.modalImg = modalImg;
	}
}

const mounted = new WeakSet<Element>();
export function init(): void {
	for (const wrap of document.querySelectorAll<HTMLElement>('[data-rmiz]')) {
		if (mounted.has(wrap) || !wrap.querySelector(':scope > [data-rmiz-content]')) continue;
		mounted.add(wrap);
		new Zoom(wrap);
	}
}
