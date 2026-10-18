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

// Behaviours start on the first event the page registers; scrolling starts with one of these.
// Alpine's visibleNavHighlighter: the heading highlighted is the last one above a line across the middle of the window.
function visibleHeading(main: HTMLElement): string | null {
  const middle = window.innerHeight / 2;
  let best: string | null = null;
  let bestTop = -Infinity;
  for (const heading of main.querySelectorAll("h2, h3, h4")) {
    const top = heading.getBoundingClientRect().top - middle;
    if (top < 0 && top > bestTop) {
      bestTop = top;
      best = heading.id;
    }
  }
  return best;
}

// Like Alpine's helper, this toggles the highlight classes itself; it stops once a client-side navigation removes its page.
export function watchHeadings(main: HTMLElement): void {
  let last = 0;
  const report = () => {
    if (!main.isConnected) return window.removeEventListener("scroll", onScroll);
    const id = visibleHeading(main);
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-toc] a")) {
      link.classList.toggle("font-medium", link.hash === `#${id}`);
      link.classList.toggle("text-gray-900", link.hash === `#${id}`);
    }
  };
  const onScroll = () => {
    const now = Date.now();
    if (now - last < 50) return;
    last = now;
    report();
  };
  report();
  window.addEventListener("scroll", onScroll, { passive: true });
}
