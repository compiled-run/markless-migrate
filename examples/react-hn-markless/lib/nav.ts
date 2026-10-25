/** react-router 2's activeClassName: a link is active on its own path and every path below it. */
export function navClass(current: string, to: string, base = ''): string {
	const active = current === to || current.startsWith(`${to}/`);
	return [base, active ? 'active' : ''].filter(Boolean).join(' ');
}
