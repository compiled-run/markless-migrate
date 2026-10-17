import NavList from './nav-list.tsrx';

export default function DocsSidebar({ pathname }: { readonly pathname: string }) @{
	<aside class="fixed left-0 bottom-0 hidden w-48 px-8 pb-6 pt-8 md:block lg:w-64  md:top-[6rem] " hover-scrollbar="">
		<NavList pathname={pathname} mobile={false} />
	</aside>
}
