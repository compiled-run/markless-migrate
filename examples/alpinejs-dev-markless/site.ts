export interface Heading {
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
  "/": {
    title: "Alpine.js",
    description: "A rugged, minimal framework for composing behavior directly in your markup.",
    image: "https://alpinejs.dev/social.jpg",
  },
  "/start-here": { title: "Start Here — Alpine.js", description: "", image: "" },
  "/directives/model": { title: "model — Alpine.js", description: "", image: "" },
};

export function headFor(pathname: string): Head {
  return HEADS[pathname] ?? { title: "Alpine.js", description: "", image: "" };
}

export function normalize(pathname: string | undefined): string {
  return (pathname ?? "/").replace(/\/+$/, "") || "/";
}

export const MODEL_HEADINGS: readonly Heading[] = [
  { id: "text-inputs", text: "Text inputs", level: 2 },
  { id: "textarea-inputs", text: "Textarea inputs", level: 2 },
  { id: "checkbox-inputs", text: "Checkbox inputs", level: 2 },
  { id: "single-checkbox-with-boolean", text: "Single checkbox with boolean", level: 3 },
  {
    id: "multiple-checkboxes-bound-to-array",
    text: "Multiple checkboxes bound to array",
    level: 3,
  },
  { id: "radio-inputs", text: "Radio inputs", level: 2 },
  { id: "select-inputs", text: "Select inputs", level: 2 },
  { id: "single-select", text: "Single select", level: 3 },
  { id: "single-select-with-placeholder", text: "Single select with placeholder", level: 3 },
  { id: "multiple-select", text: "Multiple select", level: 3 },
  {
    id: "dynamically-populated-select-options",
    text: "Dynamically populated Select Options",
    level: 3,
  },
  { id: "range-inputs", text: "Range inputs", level: 2 },
  { id: "modifiers", text: "Modifiers", level: 2 },
  { id: "lazy", text: ".lazy", level: 3 },
  { id: "change", text: ".change", level: 3 },
  { id: "blur", text: ".blur", level: 3 },
  { id: "enter", text: ".enter", level: 3 },
  { id: "combining-event-modifiers", text: "Combining Event Modifiers", level: 3 },
  { id: "number", text: ".number", level: 3 },
  { id: "boolean", text: ".boolean", level: 3 },
  { id: "debounce", text: ".debounce", level: 3 },
  { id: "throttle", text: ".throttle", level: 3 },
  { id: "fill", text: ".fill", level: 3 },
  { id: "programmatic access", text: "Programmatic access", level: 2 },
];

export const START_HEADINGS: readonly Heading[] = [
  { id: "building-a-counter", text: "Building a counter", level: 2 },
  { id: "declaring-data", text: "Declaring data", level: 3 },
  { id: "listening-for-events", text: "Listening for events", level: 3 },
  { id: "reacting-to-changes", text: "Reacting to changes", level: 3 },
  { id: "building-a-dropdown", text: "Building a dropdown", level: 2 },
  { id: "toggling-elements", text: "Toggling elements", level: 3 },
  { id: "listening-for-a-click-outside", text: "Listening for a click outside", level: 3 },
  { id: "building-a-search-input", text: "Building a search input", level: 2 },
  { id: "multi-line-formatting", text: "Multi line formatting", level: 3 },
  { id: "binding-to-inputs", text: "Binding to inputs", level: 3 },
  { id: "computed-properties-using-getters", text: "Computed properties using getters", level: 3 },
  { id: "looping-elements", text: "Looping elements", level: 3 },
  { id: "recap", text: "Recap", level: 2 },
];

// Behaviours start on the first event the page registers; scrolling starts with one of these.
export const wake = (): void => undefined;

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

// Like Alpine's helper, this toggles the highlight classes itself: in Markless 0.4.0 attach cannot write state, and rows of a
// keyed list do not update after resume.
export function watchHeadings(main: HTMLElement): () => void {
  let last = 0;
  const report = () => {
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
  return () => window.removeEventListener("scroll", onScroll);
}
