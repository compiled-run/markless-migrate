// Self-contained on purpose: lib/site.ts calls these, and the navbar inlines their source so a tap works before lib/site.ts loads.
export function drawerMarkup(nav, k, sidebarMenu, dropdownOnly) {
	const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const navItem = (link) => {
		const copy = link.cloneNode(true);
		const rest = [...link.classList].filter((c) => c !== 'navbar__item' && c !== 'navbar__link').map((c) => (c === 'navbar__link--active' ? 'menu__link--active' : c));
		copy.className = ['menu__link', ...rest.filter((c) => c !== 'menu__link')].join(' ');
		return `<li class="menu__list-item">${copy.outerHTML}</li>`;
	};
	const dropdown = (el, label, labelIcon, withList) => {
		const items = [...el.querySelectorAll(':scope > .dropdown__menu > li')];
		const collapsed = !items.some((li) => li.querySelector('a.dropdown__link--active') && !li.querySelector('a[lang]'));
		const list = items
			.map((li) => {
				const a = li.querySelector('a');
				if (!a) return `<li class="${['menu__list-item', li.className].filter(Boolean).join(' ')}">${li.innerHTML}</li>`;
				const copy = a.cloneNode(true);
				copy.className = ['menu__link', ...[...a.classList].filter((cl) => cl !== 'dropdown__link').map((cl) => (cl === 'dropdown__link--active' ? 'menu__link--active' : cl))].join(' ');
				for (const svg of copy.querySelectorAll('svg[width="12"]')) {
					svg.setAttribute('width', '13.5');
					svg.setAttribute('height', '13.5');
				}
				return `<li class="menu__list-item">${copy.outerHTML}</li>`;
			})
			.join('');
		return `<li class="menu__list-item${collapsed ? ' menu__list-item--collapsed' : ''}"><div class="menu__list-item-collapsible"><a href="#" role="button" class="${k.dropdownMobile} menu__link menu__link--sublist">${labelIcon}${label}</a><button aria-label="${collapsed ? 'Expand' : 'Collapse'} the dropdown" aria-expanded="${!collapsed}" type="button" class="clean-btn menu__caret"></button></div>${collapsed && !withList ? '' : `<ul class="menu__list" style="display: block; overflow: visible; height: auto;">${list}</ul>`}</li>`;
	};
	if (dropdownOnly) return dropdown(dropdownOnly.el, dropdownOnly.label, dropdownOnly.icon, true);
	const blogSidebar = (blogNav) => {
		const list = (ul) => `<ul class="menu__list">${[...ul.querySelectorAll(':scope > li > a')].map((a) => `<li class="menu__list-item"><a class="menu__link${a.getAttribute('aria-current') ? ' menu__link--active' : ''}"${a.getAttribute('aria-current') ? ' aria-current="page"' : ''} href="${a.getAttribute('href')}">${a.innerHTML}</a></li>`).join('')}</ul>`;
		const heading = (h3) => (h3 ? `<h3 class="${k.yearGroupHeading}">${h3.innerHTML}</h3>` : '');
		const groups = [...blogNav.querySelectorAll(':scope > [role=group]')];
		if (groups.length) return groups.map((g) => `<div role="group">${heading(g.querySelector('h3'))}${list(g.querySelector('ul'))}</div>`).join('');
		const ul = blogNav.querySelector(':scope > ul');
		return ul ? list(ul) : '';
	};
	const inner = nav.querySelector(':scope > .navbar__inner');
	if (!inner) return null;
	const brand = inner.querySelector('.navbar__brand')?.outerHTML ?? '';
	const toggle = inner.querySelector(`.${k.colorModeToggle}`);
	const toggleCopy = toggle?.cloneNode(true);
	if (toggleCopy) toggleCopy.className = `${k.toggle} margin-right--md`;
	const primary = [];
	for (const el of [...inner.querySelectorAll(':scope > .navbar__items > *')]) {
		if (el.matches('button.navbar__toggle, a.navbar__brand') || el.classList.contains(k.colorModeToggle) || el.classList.contains(k.searchContainer)) continue;
		if (el.matches('a.navbar__item')) primary.push(navItem(el));
		else if (el.matches('.dropdown')) {
			const link = el.querySelector(':scope > .navbar__link');
			primary.push(dropdown(el, link.querySelector('svg') ? 'Languages' : 'Versions', link.querySelector('svg')?.outerHTML ?? '', false));
		} else if (el.matches('button:not([class])')) primary.push(`<button type="button">${escapeHtml(el.textContent ?? '')} (mobile)</button>`);
		else if (el.matches('div.navbar__item')) primary.push(`<li class="${el.className.replace('navbar__item', 'menu__list-item').trim()}">${el.innerHTML}</li>`);
	}
	const blogNav = document.querySelector('nav[aria-label="Blog recent posts navigation"]');
	const secondary = sidebarMenu ? sidebarMenu.outerHTML : blogNav ? blogSidebar(blogNav) : '';
	const showSecondary = Boolean(secondary);
	const close = '<svg viewBox="0 0 15 15" width="21" height="21"><g stroke="var(--ifm-color-emphasis-600)" stroke-width="1.2"><path d="M.75.75l13.5 13.5M14.25.75L.75 14.25"></path></g></svg>';
	const panel = 'theme-layout-navbar-sidebar-panel navbar-sidebar__item menu';
	return {
		showSecondary,
		markup: `<div class="theme-layout-navbar-sidebar navbar-sidebar"><div class="navbar-sidebar__brand">${brand}${toggleCopy?.outerHTML ?? ''}<button type="button" aria-label="Close navigation bar" class="clean-btn navbar-sidebar__close">${close}</button></div><div class="navbar-sidebar__items${showSecondary ? ' navbar-sidebar__items--show-secondary' : ''}"><div class="${panel}"${showSecondary ? ' inert=""' : ''}><ul class="menu__list">${primary.join('')}</ul></div><div class="${panel}"${showSecondary ? '' : ' inert=""'}><button type="button" class="clean-btn navbar-sidebar__back">← Back to main menu</button>${secondary}</div></div></div>`,
	};
}

export function earlyDrawer(script, build, k) {
	const button = script.previousElementSibling;
	const nav = button.closest('nav');
	const booted = () => window.__mmSiteBooted;
	script.remove();
	if (booted()) return;
	button.addEventListener('click', (event) => {
		if (booted()) return;
		if (!nav.querySelector(':scope > .theme-layout-navbar-sidebar')) {
			const drawer = build(nav, k, document.querySelector('nav[aria-label="Docs sidebar"] > ul.theme-doc-sidebar-menu'));
			if (!drawer) return;
			nav.insertAdjacentHTML('beforeend', drawer.markup);
		}
		nav.classList.add('navbar-sidebar--show');
		button.setAttribute('aria-expanded', 'true');
		document.body.style.overflow = 'hidden';
	});
	nav.addEventListener('click', (event) => {
		if (booted() || !(event.target instanceof Element)) return;
		if (event.target.closest('.navbar-sidebar__backdrop, .navbar-sidebar__close')) {
			nav.classList.remove('navbar-sidebar--show');
			button.setAttribute('aria-expanded', 'false');
			document.body.style.overflow = 'visible';
		} else if (event.target.closest(`.navbar-sidebar .${k.toggle} button`)) {
			nav.querySelector(`:scope > .navbar__inner .${k.colorModeToggle} button`)?.click();
			event.__mmColorMode = 1;
			window.__mmColorModeAt = event.timeStamp;
		}
	});
}
