// The keyboard-shortcuts demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the
// page's own init("/init") and onPost("/doit"), and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly code: string;
}

// What init("/init") wrote into #demo-canvas, shown as the timeline's initial state.
export const INITIAL_CODE =
  "<button class='btn primary' style='font-size:20pt' hx-trigger='click, keyup[altKey&&shiftKey&&code==\"KeyD\"] from:body'" +
  " hx-post='/doit'>Do It! (alt-shift-D) </button>";

// onPost("/doit") answers "Did it!"; the button sends no body, and demo.js lists only the response's hx- headers, of
// which there are none.
export const DID_IT = "Did it!";

export function doitEntry(n: number): Entry {
  return { id: `req-${n}`, label: "POST /doit", code: DID_IT };
}

// hx-trigger="keyup[altKey&&shiftKey&&code=='KeyD'] from:body".
export const isShortcut = (event: KeyboardEvent) => event.altKey && event.shiftKey && event.code === "KeyD";

// Where an answered POST /doit goes: the page's state.
export interface DoitPage {
  logged(): number;
  busy(on: boolean): void;
  answer(entry: Entry): void;
}

// hx-post="/doit": the fake server answers after 80 ms and the response replaces the button's content (innerHTML). The
// button carries htmx-request until then; a trigger while the request is out waits and runs once it is answered, as
// htmx's default hx-sync queues the last.
let inFlight = false;
let waiting: DoitPage | undefined;
export function postDoit(page: DoitPage): void {
  if (inFlight) {
    waiting = page;
    return;
  }
  inFlight = true;
  page.busy(true);
  setTimeout(() => {
    page.answer(doitEntry(page.logged() + 1));
    page.busy(false);
    inFlight = false;
    const next = waiting;
    waiting = undefined;
    if (next) postDoit(next);
  }, 80);
}
