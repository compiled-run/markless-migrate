const TITLES: Record<string, string> = { '/': 'Remix Notes', '/login': 'Login', '/join': 'Sign Up' };

// Remix renders a <title> only for routes whose meta names one; the notes routes have none.
export const titleFor = (pathname: string) => TITLES[pathname.replace(/(.)\/+$/, '$1')] ?? '';
