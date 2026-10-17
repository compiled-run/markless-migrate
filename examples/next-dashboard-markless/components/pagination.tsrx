import { ArrowLeftIcon } from './icons/ArrowLeftIcon.tsrx';
import { ArrowRightIcon } from './icons/ArrowRightIcon.tsrx';
import type { PageItem } from '../lib/pagination.ts';

type Arrow = { readonly className: string; readonly href: string | undefined };

// A disabled arrow or the current page is an anchor without href: no link role, as the old <div> had none.
export default function Pagination({ items, left, right }: { readonly items: readonly PageItem[]; readonly left: Arrow; readonly right: Arrow }) @{
	<div class="inline-flex">
		<a class={left.className} href={left.href}>
			<ArrowLeftIcon iconClass="w-4" />
		</a>
		<div class="flex -space-x-px">
			@for (const item of items; key item.key) {
				<a href={item.href} class={item.className}>{item.label}</a>
			}
		</div>
		<a class={right.className} href={right.href}>
			<ArrowRightIcon iconClass="w-4" />
		</a>
	</div>
}
