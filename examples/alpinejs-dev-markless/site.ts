import { DOC_HEADS } from './generated/heads.ts';
import { SERVER_HEADS } from './generated/server-heads.ts';

export interface Heading {
  readonly key: number;
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3 | 4;
}

export interface Head {
  readonly title: string;
  readonly description: string;
  readonly image: string;
}

const HEADS: Record<string, Head> = {
  ...DOC_HEADS,
  ...SERVER_HEADS,
  "/": {
    title: "Alpine.js",
    description: "A rugged, minimal framework for composing behavior directly in your markup.",
    image: "https://alpinejs.dev/social.jpg",
  },
};

export function headFor(pathname: string): Head {
  return HEADS[pathname] ?? { title: "Alpine.js", description: "", image: "" };
}

export function normalize(pathname: string | undefined): string {
  return (pathname ?? "/").replace(/\/+$/, "") || "/";
}

// Alpine's visibleNavHighlighter: the heading highlighted is the last one above a line across the middle of the window
// (headings at the same distance: the later one, as its object of distances keeps).
function visibleHeading(main: HTMLElement): string | null {
  const middle = window.innerHeight / 2;
  const byDistance: Record<string, HTMLElement> = {};
  for (const heading of main.querySelectorAll<HTMLElement>("h2:not([no-sidebar]), h3:not([no-sidebar]), h4:not([no-sidebar])")) {
    byDistance[heading.getBoundingClientRect().top - middle] = heading;
  }
  const closest = Math.max(...Object.keys(byDistance).map(Number).filter((top) => top < 0));
  if (closest >= 0 || !Number.isFinite(closest)) return null;
  return byDistance[closest]?.id ?? null;
}

// Like Alpine's helper, this toggles the highlight classes itself; it stops once a client-side navigation removes its page.
export function watchHeadings(main: HTMLElement): void {
  let throttled = false;
  const report = () => {
    if (!main.isConnected) return window.removeEventListener("scroll", onScroll);
    const id = visibleHeading(main);
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-toc] a")) {
      link.classList.toggle("font-medium", link.hash === `#${id}`);
      link.classList.toggle("text-gray-900", link.hash === `#${id}`);
    }
  };
  // x-on:scroll.window.throttle.50ms: the first scroll runs, then none until 50ms have passed (Alpine's throttle).
  const onScroll = () => {
    if (throttled) return;
    report();
    throttled = true;
    setTimeout(() => (throttled = false), 50);
  };
  report();
  window.addEventListener("scroll", onScroll, { passive: true });
}
