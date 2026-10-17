const DESCRIPTION = `htmx gives you access to AJAX, CSS Transitions, WebSockets and Server Sent Events directly in HTML, using attributes, so you can build modern user interfaces with the simplicity and power of hypertext

    htmx is small (~14k min.gz’d), dependency-free, extendable, IE11 compatible & has reduced code base sizes by 67% when compared with react`;

export interface Head {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly stylesheet?: string;
}

const HEADS: Record<string, Head> = {
  "/": {
    title: "</> htmx - high power tools for html",
    description: DESCRIPTION,
    canonical: "https://htmx.org/",
    stylesheet: "/css/port-home.css",
  },
  "/docs/": {
    title: "</> htmx ~ Documentation",
    description: DESCRIPTION,
    canonical: "https://htmx.org/docs/",
  },
  "/examples/": {
    title: "</> htmx ~ Examples",
    description: DESCRIPTION,
    canonical: "https://htmx.org/examples/",
  },
  "/examples/click-to-edit/": {
    title: "</> htmx ~ Examples ~ Click to Edit",
    description: DESCRIPTION,
    canonical: "https://htmx.org/examples/click-to-edit/",
    stylesheet: "/css/port-click-to-edit.css",
  },
};

export function headFor(pathname: string | undefined): Head {
  const path = pathname ?? "/";
  return HEADS[path.endsWith("/") ? path : `${path}/`] ?? HEADS["/"]!;
}
