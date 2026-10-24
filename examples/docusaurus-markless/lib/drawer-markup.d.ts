export type DrawerClasses = { toggle: string; colorModeToggle: string; searchContainer: string; dropdownMobile: string; yearGroupHeading: string };
export function drawerMarkup(nav: Element, k: DrawerClasses, sidebarMenu: Element | null, dropdownOnly?: { el: Element; label: string; icon: string }): { markup: string; showSecondary: boolean } | string | null;
export function earlyDrawer(script: HTMLScriptElement, build: typeof drawerMarkup, k: DrawerClasses): void;
