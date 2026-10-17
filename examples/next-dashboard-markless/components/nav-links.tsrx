import { DocumentDuplicateIcon } from './icons/DocumentDuplicateIcon.tsrx';
import { HomeIcon } from './icons/HomeIcon.tsrx';
import { UserGroupIcon } from './icons/UserGroupIcon.tsrx';

const BASE = 'flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3';
const linkClass = (pathname: string, href: string) => (pathname === href ? `${BASE} bg-sky-100 text-blue-600` : BASE);

export default function NavLink({ pathname, href, name }: { readonly pathname: string; readonly href: string; readonly name: string }) @{
	<a href={href} class={linkClass(pathname, href)}>
		@switch (name) {
			@case 'Home': {
				<HomeIcon iconClass="w-6" />
			}
			@case 'Invoices': {
				<DocumentDuplicateIcon iconClass="w-6" />
			}
			@default: {
				<UserGroupIcon iconClass="w-6" />
			}
		}
		<p class="hidden md:block">{name}</p>
	</a>
}
