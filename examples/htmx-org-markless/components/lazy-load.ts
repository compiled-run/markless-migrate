// The lazy-load demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own routes and template, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// server.autoRespondAfter = 2000: "longer response for more drama".
export const RESPONSE_DELAY = 2000;
// htmx's default settle delay: the target carries htmx-settling this long after the swap.
export const SETTLE_DELAY = 20;

// The page's lazyTemplate(), which init("/demo") writes into #demo-canvas and logs as the initial state.
export const INITIAL_CODE = `<div hx-get="/graph" hx-trigger="load">
  <img alt="Result loading..." class="htmx-indicator" width="150" src="/img/bars.svg"/>
</div>`;

// onGet("/graph"): the response, logged as req-1 when it is swapped in.
export const GRAPH_ENTRY: Entry = {
  id: "req-1",
  label: "GET /graph",
  method: "GET",
  url: "/graph",
  params: "{}",
  headers: "{}",
  code: "<img alt='Tokyo Climate' src='/img/tokyo.png'>",
};
