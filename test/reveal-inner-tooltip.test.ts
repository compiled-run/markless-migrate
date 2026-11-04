// A sheet whose open focus lands on a tooltip trigger inside it (Radix opens the tooltip on that focus): the tooltip is
// a layer of its own trigger, so the tooltip part can hide it and the sheet's outside press is not held by it.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { parseFragment } from 'parse5';
import { chromium, type Browser } from 'playwright';
import { captureRouteReveals } from '../src/convert/reveal.ts';

const PAGE = `<!doctype html><html><body><main><button id="open" aria-expanded="false" aria-haspopup="dialog">View Code</button></main><script>
const opener = document.getElementById('open');
opener.addEventListener('click', () => {
	opener.setAttribute('aria-expanded', 'true');
	document.body.insertAdjacentHTML('beforeend', '<div role="dialog" id="sheet" data-state="open"><button data-slot="tooltip-trigger" data-state="closed">Copy</button><pre>code</pre></div>');
	const copy = document.querySelector('#sheet button');
	copy.focus();
	copy.setAttribute('data-state', 'instant-open');
	copy.setAttribute('aria-describedby', 'tip-text');
	document.body.insertAdjacentHTML('beforeend', '<div data-radix-popper-content-wrapper=""><div data-slot="tooltip-content" data-state="instant-open">Copy code<span id="tip-text" role="tooltip">Copy code</span></div></div>');
});
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape') return;
	for (const el of document.querySelectorAll('#sheet, [data-radix-popper-content-wrapper]')) el.remove();
	opener.setAttribute('aria-expanded', 'false');
});
</script></body></html>`;

let browser: Browser;
let server: Server;
let origin: string;
before(async () => {
	browser = await chromium.launch();
	server = createServer((_request, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
	await browser.close();
	server.close();
});

type Node = { nodeName: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };
const elements = (html: string): Node[] => {
	const out: Node[] = [];
	const visit = (n: Node) => {
		if (n.attrs) out.push(n);
		for (const c of n.childNodes ?? []) visit(c);
	};
	visit(parseFragment(html) as unknown as Node);
	return out;
};
const attrOf = (el: Node, name: string) => el.attrs?.find((a) => a.name === name)?.value;

test("a tooltip a sheet's open focus showed is keyed to its own trigger, not captured under the sheet's", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'reveal-inner-tooltip-'));
	try {
		const { reveals } = await captureRouteReveals(browser, origin, '/', dir);
		const sheet = reveals.find((r) => r.key === 'open' && r.viewport === 'desktop');
		assert.ok(sheet, 'the sheet is captured under its trigger');
		assert.deepEqual(
			sheet.added.filter((a) => elements(a.html).some((e) => attrOf(e, 'role') === 'tooltip')),
			[],
			'the sheet holds no tooltip',
		);
		const copy = sheet.added.flatMap((a) => elements(a.html)).find((e) => attrOf(e, 'data-slot') === 'tooltip-trigger')!;
		const key = attrOf(copy, 'data-mm-key');
		assert.ok(key, 'the Copy trigger in the sheet names its own layer');
		assert.equal(attrOf(copy, 'data-state'), 'closed', 'the trigger is captured as it is before its tooltip shows');
		assert.equal(attrOf(copy, 'aria-describedby'), undefined);
		const tip = reveals.find((r) => r.key === key);
		assert.ok(tip, "the tooltip is captured under the trigger's key");
		assert.equal(tip.from, 'open', 'it opens from inside the sheet');
		assert.equal(tip.action, 'hover');
		assert.ok(tip.added.some((a) => a.into === 'body' && elements(a.html).some((e) => attrOf(e, 'role') === 'tooltip')));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
