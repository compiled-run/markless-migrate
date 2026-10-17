// NavLink's active state: aria-current="page" and an extra class on the link to the note being shown.
export const noteLinkClass = (pathname: string, id: string) => `block border-b p-4 text-xl ${pathname === `/notes/${id}` ? 'bg-white' : ''}`;
export const noteLinkCurrent = (pathname: string, id: string) => (pathname === `/notes/${id}` ? 'page' : undefined);
