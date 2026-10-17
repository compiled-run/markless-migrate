// Markless 0.4.0 renders `<html lang="en">` for a document.tsrx whatever its <Html> says, so the opening tag is rewritten here.
import { onResponse } from 'h3';

const OPENING = '<html lang="en">';
const WANTED = '<html lang="en-US" dir="ltr" data-variant="vite" data-theme="dark">';

export default onResponse((response) => {
	if (!response.body || !response.headers.get('content-type')?.includes('text/html')) return;
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let head = '';
	let done = false;
	const body = response.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				if (done) return controller.enqueue(chunk);
				head += decoder.decode(chunk, { stream: true });
				if (head.length < 256 && !head.includes('<head')) return;
				done = true;
				controller.enqueue(encoder.encode(head.replace(OPENING, WANTED)));
			},
			flush(controller) {
				if (!done) controller.enqueue(encoder.encode(head.replace(OPENING, WANTED) + decoder.decode()));
			},
		}),
	);
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	return new Response(body, { status: response.status, statusText: response.statusText, headers });
});
