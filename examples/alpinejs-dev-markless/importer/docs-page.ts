import { label, type DocPage, DEMO_MARK } from './docs.ts';
import { htmlToTsrx, lit } from './tsrx.ts';
import { GENERATED } from './write.ts';

export interface DemoRef {
	readonly name: string;
	readonly inline?: string;
}

// One docs page: the site's header, sidebar and contents column around the rendered markdown, the sponsor box, the
// previous/next links and the Torchlight credit, as every alpinejs.dev docs page has them.
export function docsPage(page: DocPage, previous: DocPage | undefined, next: DocPage | undefined, demos: readonly DemoRef[], demoModule: string | undefined, index = false): string {
	const up = '../'.repeat(page.route.split('/').length - 1 + (index ? 1 : 0));
	const imports = [
		`import type { PageProps } from '@markless/router';`,
		`import DocsHeader from '${up}components/docs-header.tsrx';`,
		`import DocsSidebar from '${up}components/docs-sidebar.tsrx';`,
		`import Sponsor from '${up}components/sponsor.tsrx';`,
		`import Toc from '${up}components/toc.tsrx';`,
		`import Attribution from '${up}components/attribution.tsrx';`,
		`import { watchHeadings } from '${up}site.ts';`,
	];
	const used = demos.filter((d) => !d.inline).map((d) => d.name);
	if (used.length && demoModule) imports.push(`import { ${used.join(', ')} } from '${up}${demoModule}';`);
	const body = htmlToTsrx(page.doc.html, 4, {
		element: (el, depth) => {
			const mark = el.attrs.find((a) => a.name === DEMO_MARK);
			if (!mark) return undefined;
			const demo = demos[Number(mark.value)]!;
			return demo.inline ?? `${'\t'.repeat(depth)}<${demo.name} />\n`;
		},
	});
	const link = (target: DocPage | undefined, text: (l: string) => string) => (target ? `\n\t\t\t\t\t\t<a class="font-bold text-cyan-400" href="${target.route}">${escapeText(text(label(target)))}</a>\n\t\t\t\t\t` : '');
	const headings = page.doc.headings.map((h, i) => `{ key: ${i}, id: ${lit(h.id)}, text: ${lit(h.text)}, level: ${h.level} }`).join(', ');
	return `${GENERATED}${imports.join('\n')}

const HEADINGS = [${headings}] as const;

export default function DocsPage({ url }: PageProps) @{
	<div style="display: contents">
		<DocsHeader pathname={url.pathname} />
		<DocsSidebar pathname={url.pathname} />
		<main class="pt-32 pl-0 pr-0 md:pl-48 lg:pl-64 xl:pr-64" onIdle={(event) => watchHeadings(event.target as HTMLElement)}>
			<div class="m-auto max-w-3xl px-6 pb-24 text-gray-800 antialiased markdown" listen-for-intersection-of-titles="">
${body}				<Sponsor wrapper="my-12 border-y border-gray-200 py-6 xl:hidden" label="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400" />
				<div class="flex justify-between border-t border-gray-200 pt-4 text-gray-700">
					<div>${link(previous, (l) => `← ${l}`)}</div>
					<div>${link(next, (l) => `${l} →`)}</div>
				</div>
				<p class="mt-6 text-center text-sm text-gray-600">Code highlighting provided by <a href="https://torchlight.dev" target="__blank" class="font-semibold text-cyan-400">Torchlight</a></p>
				<div class="mt-6 flex items-center justify-center gap-4 text-center text-sm text-gray-600"></div>
				<Attribution />
			</div>
		</main>
		<Toc headings={HEADINGS} />
	</div>
}
`;
}

function escapeText(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
}
