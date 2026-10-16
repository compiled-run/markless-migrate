import { NavLink } from './nav-link';

export function Header() {
	return (
		<header>
			<NavLink href="/">Home</NavLink>
			<NavLink href="/blog">Blog</NavLink>
		</header>
	);
}
