import { NAV, type NavItem } from '../nav.ts';

const LINK_ACTIVE = { desktop: '-ml-8 border-l-4 border-gray-700 border-cyan-400 pl-7 font-semibold', mobile: '-ml-6 border-l-4 border-gray-700 pl-5 font-semibold' };
const TOP = NAV.flatMap((entry) => (entry.kind === 'link' ? [entry] : []));
const SECTIONS = NAV.flatMap((entry) => (entry.kind === 'section' ? [entry] : []));
const FIRST = SECTIONS.slice(0, 1);
const REST = SECTIONS.slice(1);

function Section({ title, items, pathname, mobile }: { readonly title: string; readonly items: readonly NavItem[]; readonly pathname: string; readonly mobile: boolean }) @{
	<li>
		<span class="font-medium">{title}</span>
		<ul class="pl-3">
			@for (const item of items; key item.href) {
				<li class={!mobile && item.href === pathname ? 'border-l-4 border-cyan-400 pl-10 font-semibold' : ''} style={!mobile && item.href === pathname ? 'margin-left: -2.75rem' : undefined}>
					<a href={item.href} class="hover:text-gray-900">
						@if (item.prefix) {
							<span class="text-gray-300">{item.prefix}</span>;
						}
						{item.label}
					</a>
				</li>
			}
		</ul>
	</li>
}

export default function NavList({ pathname, mobile }: { readonly pathname: string; readonly mobile: boolean }) @{
	const components = mobile ? '/component/dropdown' : '/components';

	<ul class="space-y-2 text-gray-800">
		@for (const link of TOP; key link.href) {
			<li class={link.href === pathname ? LINK_ACTIVE[mobile ? 'mobile' : 'desktop'] : 'font-medium'}>
				<a href={link.href} class="hover:text-gray-900">{link.label}</a>
			</li>
		}
		@for (const section of FIRST; key section.title) {
			<Section title={section.title} items={section.items} pathname={pathname} mobile={mobile} />
		}
		<li>
			<a href={components} class="font-medium hover:text-gray-900">
				<div class="relative">{' UI Components '}</div>
			</a>
			<ul class="relative pl-3 font-medium">
				<a href={components} class="font-medium hover:text-gray-900">
					<div class={mobile ? 'absolute inset-0 bg-gradient-to-b from-[#fff2] to-gray-100' : 'absolute inset-0 bg-gradient-to-b from-[#fff2] to-white'}></div>
				</a>
				<li>
					<a href={components} class="font-medium hover:text-gray-900"></a>
					<a href="/component/dropdown">Dropdown</a>
				</li>
				<li>
					<a href="/component/modal">Modal</a>
				</li>
			</ul>
		</li>
		@for (const section of REST; key section.title) {
			<Section title={section.title} items={section.items} pathname={pathname} mobile={mobile} />
		}
	</ul>
}
