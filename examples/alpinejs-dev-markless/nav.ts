import { DOCS_NAV } from './generated/nav.ts';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly prefix: string;
}

export type NavEntry =
  | { readonly kind: "link"; readonly href: string; readonly label: string }
  | { readonly kind: "components" }
  | { readonly kind: "section"; readonly title: string; readonly items: readonly NavItem[] };

// The docs sections come from the docs' front matter; the site's layout puts its UI Components block after the first section.
const firstSection = DOCS_NAV.findIndex((entry) => entry.kind === 'section');
export const NAV: readonly NavEntry[] = [...DOCS_NAV.slice(0, firstSection + 1), { kind: 'components' }, ...DOCS_NAV.slice(firstSection + 1)];
