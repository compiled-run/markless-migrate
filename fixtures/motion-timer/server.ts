// Two-app fixture for the motion check: a copy button that shows "Copied" with an opacity fade and fades it out again
// 2 s later from a timer, as VitePress's code blocks do. `busy` holds the main thread after the click for that many
// milliseconds, as a loaded machine does, so the reset falls closer to the end of the click's own motion.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

function page(busy: number): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Copy</title>
<style>
body { font: 16px/1.5 sans-serif; margin: 24px; }
.copy { padding: 6px 10px; border: 1px solid #999; background: #fff; }
.copied { margin-left: 8px; opacity: 0; transition: opacity 250ms ease; }
.copy.done + .copied { opacity: 1; }
</style></head>
<body><main><h1>Code</h1><pre>npm create vite@latest</pre>
<button class="copy" type="button">Copy code</button><span class="copied">Copied</span></main>
<script>
const copy = document.querySelector('.copy');
copy.addEventListener('click', () => {
	copy.classList.add('done');
	setTimeout(() => copy.classList.remove('done'), 2000);
	for (const end = performance.now() + ${busy}; performance.now() < end; );
});
</script></body></html>`;
}

export async function serve(busy: number): Promise<{ origin: string; server: Server }> {
	const html = page(busy);
	const server = createServer((req, res) => {
		if (req.url === '/' || req.url?.startsWith('/?')) {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(html);
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
