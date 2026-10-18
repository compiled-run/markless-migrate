// react-medium-image-zoom once mounted: the content, and the "ghost" button over it that opens the zoomed view.
// lib/site.ts sizes the ghost over the image and opens the dialog, as the library does.
import { isElement, toArray } from '../source/h.mjs';

function imageAlt(children) {
	for (const child of toArray(children)) {
		if (!isElement(child)) continue;
		if (child.props.alt !== undefined && (child.type === 'img' || child.props.src !== undefined)) return child.props.alt;
		const found = imageAlt(child.props.children);
		if (found !== undefined) return found;
	}
	return undefined;
}

export default function Zoom({ children, zoomImg, a11yNameButtonZoom = 'Expand image' }) {
	const alt = imageAlt(children);
	return (
		<div data-rmiz="">
			<div data-rmiz-content="found" style={{ visibility: 'visible' }}>
				{children}
			</div>
			<div data-rmiz-ghost="">
				<button aria-label={alt ? `${a11yNameButtonZoom}: ${alt}` : a11yNameButtonZoom} data-rmiz-btn-zoom="" type="button" data-mm-zoom={zoomImg ? JSON.stringify(zoomImg) : ''}>
					<svg aria-hidden="true" data-rmiz-btn-zoom-icon="true" fill="currentColor" focusable="false" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
						<path d="M 9 1 L 9 2 L 12.292969 2 L 2 12.292969 L 2 9 L 1 9 L 1 14 L 6 14 L 6 13 L 2.707031 13 L 13 2.707031 L 13 6 L 14 6 L 14 1 Z"></path>
					</svg>
				</button>
			</div>
		</div>
	);
}
