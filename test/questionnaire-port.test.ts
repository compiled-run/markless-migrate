// The Questionnaire port against the real library: each demo's form as the library rendered it, driven through the same
// script, must show what the library showed after every step (test/ports/questionnaire-oracle.json).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import ts from 'typescript';
import { perform, SCRIPT, snapshot, type Demo } from './ports/questionnaire-oracle.ts';

const ROOT = join(import.meta.dirname, '..');
const demos = JSON.parse(await readFile(join(ROOT, 'test/ports/questionnaire-oracle.json'), 'utf8')) as Demo[];

// From these steps on, the demo's own React state changes the questionnaire (Custom Validation's rule on which answer is
// complete enough, Navigation State's Next disabled while unanswered): what that does is the page's, not the library's.
const PAGE_STATE_FROM: Readonly<Record<number, number>> = { 5: 12, 9: 3 };

test('the Questionnaire port shows what @shadcn/react showed after every step of every demo', async () => {
	const source = ts.transpileModule(await readFile(join(ROOT, 'parts/shadcn/questionnaire.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	const browser = await chromium.launch();
	const failures: string[] = [];
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.route('http://app.test/**', (route) =>
			new URL(route.request().url()).pathname === '/questionnaire.js'
				? route.fulfill({ contentType: 'text/javascript', body: source })
				: route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
		);
		for (const demo of demos) {
			await page.goto('http://app.test/');
			await page.evaluate(async (html) => {
				const part = (await import('/questionnaire.js' as string)) as typeof import('../parts/shadcn/questionnaire.ts');
				document.body.innerHTML = html;
				for (const type of ['click', 'keydown', 'input'] as const) document.addEventListener(type, (event) => void (part as unknown as Record<string, (t: Element, e: Event) => boolean>)[type]!(event.target as Element, event));
				document.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault());
			}, demo.html);
			for (const [i, action] of SCRIPT.entries()) {
				if (i >= (PAGE_STATE_FROM[demo.index] ?? Infinity)) break;
				await perform(page, 0, action);
				const got = await page.evaluate(snapshot, 0);
				const want = demo.steps[i]!;
				const diff = want.markup.flatMap((line, n) => (got.markup[n] === line ? [] : [`  want ${line}\n  got  ${got.markup[n]}`]));
				if (diff.length || got.focus !== want.focus) {
					failures.push(`demo ${demo.index}, step ${i} (${want.action}):${got.focus !== want.focus ? ` focus ${got.focus}, want ${want.focus}` : ''}\n${diff.join('\n')}`);
					break;
				}
			}
		}
	} finally {
		await browser.close();
	}
	assert.deepEqual(failures, []);
});
