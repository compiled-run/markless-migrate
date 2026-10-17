import AcmeLogo from './acme-logo.tsrx';
import NavLink from './nav-links.tsrx';
import { PowerIcon } from './icons/PowerIcon.tsrx';

export default function SideNav({ pathname }: { readonly pathname: string }) @{
	<div class="flex h-full flex-col px-3 py-4 md:px-2">
		<a class="mb-2 flex h-20 items-end justify-start rounded-md bg-blue-600 p-4 md:h-40" href="/">
			<div class="w-32 text-white md:w-40">
				<AcmeLogo />
			</div>
		</a>
		<div class="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">
			<NavLink pathname={pathname} href="/dashboard" name="Home" />
			<NavLink pathname={pathname} href="/dashboard/invoices" name="Invoices" />
			<NavLink pathname={pathname} href="/dashboard/customers" name="Customers" />
			<div class="hidden h-auto w-full grow rounded-md bg-gray-50 md:block"></div>
			<form method="post" action="/api/auth/logout">
				<button class="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3">
					<PowerIcon iconClass="w-6" />
					<div class="hidden md:block">Sign Out</div>
				</button>
			</form>
		</div>
	</div>
}
