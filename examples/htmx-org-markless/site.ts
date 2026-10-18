import { HEADS } from './site-heads.ts';

export interface Head {
  readonly title: string;
  readonly description: string;
  readonly canonical?: string;
  readonly alternates: readonly { readonly type: string; readonly title: string; readonly href: string }[];
  readonly stylesheets: readonly string[];
  readonly scripts: readonly string[];
}

export function headFor(pathname: string | undefined): Head {
  const path = (pathname ?? "/").endsWith("/") ? (pathname ?? "/") : `${pathname}/`;
  return HEADS[path] ?? HEADS["/404/"]!;
}
