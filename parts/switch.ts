// The cookies a site-listed switch wrote on the old page for the state it now shows (a sidebar's sidebar_state).
export function writeCookies(list: readonly { readonly name: string; readonly value: string; readonly path: string; readonly maxAge?: number; readonly sameSite?: string }[]): void {
	for (const c of list) document.cookie = `${c.name}=${c.value}; path=${c.path}${c.maxAge !== undefined ? `; max-age=${c.maxAge}` : ''}${c.sameSite ? `; samesite=${c.sameSite}` : ''}`;
}
