import type { DemoRef } from './docs-page.ts';
import { htmlToTsrx } from './tsrx.ts';

export interface Translated {
	readonly refs: readonly DemoRef[];
	readonly module: string | undefined;
}

export function translateDemos(demos: readonly string[], _context: { route: string; up: string }): Translated {
	const refs = demos.map((html, i) => ({ name: `Demo${i}`, inline: htmlToTsrx(html.replace(/\s(x-[\w:.-]+|@[\w:.-]+|:[\w:.-]+)(="[^"]*")?/g, '').replace(/<script[\s\S]*?<\/script>/g, ''), 4) }));
	return { refs, module: undefined };
}
