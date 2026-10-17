import Sponsor from './sponsor.tsrx';
import type { Heading } from '../site.ts';

const INDENT = { 2: '', 3: ' ml-4', 4: ' ml-8' };

export default function Toc({ headings }: { readonly headings: readonly Heading[] }) @{
	<aside
		class="fixed right-0 bottom-0 hidden w-64 overflow-y-auto py-8 px-6 xl:block  md:top-[4rem] "
		data-toc=""
	>
		<span class="mb-2 block text-sm font-semibold uppercase tracking-wider text-gray-300">On this page</span>
		<ul class="space-y-3 text-gray-800">
			{/* Alpine leaves its x-for <template> first in this list, and .space-y-3 then gives the first item its top margin too. */}
			<template></template>
			@for (const heading of headings; key heading.id) {
				<li class={`text-sm text-gray-600${INDENT[heading.level]}`}>
					<a href={`#${heading.id}`} class="hover:text-gray-900">{heading.text}</a>
				</li>
			}
		</ul>
		<Sponsor wrapper="mt-8" label="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-300" />
		<div id="crbnad" class="mt-8"></div>
	</aside>
}
