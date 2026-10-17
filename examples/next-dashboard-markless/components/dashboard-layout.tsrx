import type { Children } from '@markless/core';
import SideNav from './sidenav.tsrx';

export default function DashboardLayout({ pathname, children }: { readonly pathname: string; readonly children?: Children }) @{
	<div class="flex h-screen flex-col md:flex-row md:overflow-hidden">
		<div class="w-full flex-none md:w-64">
			<SideNav pathname={pathname} />
		</div>
		<div class="grow p-6 md:overflow-y-auto md:p-12">{children}</div>
	</div>
}
