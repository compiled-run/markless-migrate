import { avatar, currentUser } from './api.ts';
import { esc } from './render.ts';
import { afterSoftNavigation, installNavigation } from './nav.ts';

const NBSP = ' ';

function link(href: string, label: string, active: boolean, extra = ''): string {
	return `<li class="nav-item"><a class="nav-link${extra}${active ? ' active' : ''}" href="${href}">${label}</a></li>`;
}

// routerLinkActive in the old header: exact for Home, prefix for the rest.
function under(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

export async function bootHeader(container: Element | null | undefined): Promise<void> {
	installNavigation();
	// Read before any guard rewrites the address; a route the old app had no match for leaves nothing active.
	const unmatched = (window as { __conduitUnmatched?: boolean }).__conduitUnmatched === true;
	const { pathname, search } = window.location;
	const result = await currentUser();
	const draw = (path: string, homeActive: boolean) => drawNav(container, result, path, homeActive);
	draw(unmatched ? '' : pathname, !unmatched && pathname === '/' && search === '');
	afterSoftNavigation(() => draw(window.location.pathname, window.location.pathname === '/' && window.location.search === ''));
}

function drawNav(container: Element | null | undefined, result: Awaited<ReturnType<typeof currentUser>>, path: string, homeActive: boolean): void {
	const nav = container?.querySelector('ul.navbar-nav');
	if (!nav) return;
	let items: string;
	if (result.status === 'authenticated' && result.user) {
		const name = esc(result.user.username);
		items = [
			link('/', ' Home ', homeActive),
			link('/editor', `<i class="ion-compose"></i>${NBSP}New Article `, under(path, '/editor')),
			link('/settings', `<i class="ion-gear-a"></i>${NBSP}Settings `, under(path, '/settings')),
			link(`/profile/${name}`, `<img src="${esc(avatar(result.user.image))}" class="user-pic"> ${name} `, under(path, `/profile/${result.user.username}`)),
		].join('');
	} else if (result.status === 'unavailable') {
		items = [
			link('/', ' Home ', homeActive),
			link('/editor', `<i class="ion-compose"></i>${NBSP}New Article `, under(path, '/editor')),
			link('/settings', `<i class="ion-gear-a"></i>${NBSP}Settings `, under(path, '/settings')),
			`<li class="nav-item"><span class="nav-link" title="Auth unavailable - retrying automatically"><i class="ion-load-c"></i>${NBSP}Connecting... </span></li>`,
		].join('');
	} else {
		items = [link('/', ' Home ', false), link('/login', ' Sign in ', under(path, '/login')), link('/register', ' Sign up ', under(path, '/register'), ' nav-signup')].join('');
	}
	nav.innerHTML = items;
}
