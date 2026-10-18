// react-medium-image-zoom as the server renders it: no image is found until the browser has it, so there is no ghost
// button and no dialog yet; lib/image-zoom.ts adds them as the library does once the image has loaded.
export default function Zoom({ children }) {
	return (
		<div data-rmiz="">
			<div data-rmiz-content="not-found" style={{ visibility: 'visible' }}>
				{children}
			</div>
		</div>
	);
}
