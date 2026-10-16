'use client';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
	return <a href={href}>{children}</a>;
}
