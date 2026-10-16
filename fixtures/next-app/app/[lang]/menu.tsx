'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';

export function Menu({ label, links }: { label: string; links: readonly { href: string; text: string }[] }) {
	const [open, setOpen] = useState(false);
	const button = useRef<HTMLButtonElement>(null);
	return (
		<div
			className="menu"
			onKeyDown={(event) => {
				if (event.key === 'Escape' && open) {
					setOpen(false);
					button.current?.focus();
				}
			}}
		>
			<button ref={button} type="button" className="menu-button" aria-expanded={open} aria-controls="more-menu" onClick={() => setOpen(!open)}>
				{label}
			</button>
			<ul id="more-menu" hidden={!open}>
				{links.map((link) => (
					<li key={link.href}>
						<Link href={link.href}>{link.text}</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
