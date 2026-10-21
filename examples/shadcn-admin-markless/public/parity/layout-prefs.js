// The sidebar layout the old SidebarProvider and LayoutProvider read from their cookies on load, put on the server's
// default markup before the first paint (the theme and dir are set by the document's head script). The server renders
// the same page for every visitor; components/layout/shell.tsrx takes these values into its state once it shows.
// A static script: it only edits attributes and classes the Shell renders from that state.
(() => {
	const cookie = (name) => {
		const parts = `; ${document.cookie}`.split(`; ${name}=`);
		return parts.length === 2 ? parts.pop().split(';').shift() : undefined;
	};
	const open = cookie('sidebar_state') !== 'false';
	const variant = cookie('layout_variant') || 'inset';
	const collapsible = cookie('layout_collapsible') || 'icon';
	const sidebar = document.querySelector('[data-slot=sidebar]');
	if (!sidebar || (open && variant === 'inset')) return;
	sidebar.dataset.state = open ? 'expanded' : 'collapsed';
	sidebar.dataset.collapsible = open ? '' : collapsible;
	sidebar.dataset.variant = variant;
	if (variant === 'sidebar') {
		const gap = sidebar.querySelector('[data-slot=sidebar-gap]');
		gap?.classList.replace('group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]', 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)');
		const container = sidebar.querySelector('[data-slot=sidebar-container]');
		if (container) {
			container.classList.remove('p-2', 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]');
			container.classList.add('group-data-[collapsible=icon]:w-(--sidebar-width-icon)', 'group-data-[side=left]:border-e', 'group-data-[side=right]:border-s');
		}
	}
	// Open, each nav group is a collapsible; collapsed, it is a dropdown trigger (the <li> right after it).
	for (const item of sidebar.querySelectorAll('li[data-slot=collapsible]')) {
		item.hidden = !open;
		if (item.nextElementSibling) item.nextElementSibling.hidden = open;
	}
})();
