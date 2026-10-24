// The Bootstrap modal demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the
// page's own routes, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// demo.js: server.autoRespondAfter = 80.
export const RESPONSE_DELAY = 80;
// htmx's default settle delay: the target carries htmx-settling this long after the swap.
export const SETTLE_DELAY = 20;

// What init("/demo") writes into #demo-canvas: the button, then the template's trailing "\n\t".
export const DEMO_BUTTON = `<button
	hx-get="/modal"
	hx-target="#modals-here"
	hx-trigger="click"
    data-bs-toggle="modal"
    data-bs-target="#modals-here"
	class="btn primary">Open Modal</button>
	`;

// onGet("/modal"): htmx swaps it into #modals-here's content.
export const MODAL = `<div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
        <div class="modal-header">
            <h5 class="modal-title">Modal title</h5>
        </div>
        <div class="modal-body">
            <p>Modal body text goes here.</p>
        </div>
    <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    </div>
    </div>
</div>`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', nbsp: "\u00a0" };
// What the browser makes of escaped text cut short: whole entities, and lt, gt and amp without their semicolon at the cut.
const decodeHtml = (html: string) =>
  html.replace(/&(lt|gt|amp|quot|nbsp)(;|$)/g, (whole, name: string, end: string) =>
    end || name !== "quot" ? ENTITIES[name]! : whole,
  );

// demo.js keeps the first 750 characters of an entry's HTML and adds "..."; returns the code the entry then shows.
function shownCode(before: string, code: string, after: string): string {
  const escaped = escapeHtml(code);
  if (before.length + escaped.length + after.length <= 750) return code;
  return `${decodeHtml(escaped.slice(0, Math.max(0, 750 - before.length)))}...`;
}

export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  DEMO_BUTTON,
  "</code></pre>\n</span>",
);

const MODAL_BEFORE = `<span class="activity response">
  <div>
  <b>GET</b> /modal
  </div>
  <div>
    parameters: {}
  </div>
  <div>
    headers: {}
  </div>
  <div>
  <b>Response</b>
  <pre class="language-html"><code class="language-html">`;
const MODAL_CODE = shownCode(MODAL_BEFORE, MODAL, "</code> </pre>\n  </div>\n</span>");

export function modalEntry(n: number): Entry {
  return { id: `req-${n}`, label: "GET /modal", method: "GET", url: "/modal", params: "{}", headers: "{}", code: MODAL_CODE };
}

// htmx's innerHTML swap into #modals-here: the modal replaces its content, and the target carries htmx-settling for the
// settle delay. Plain DOM work, since Bootstrap owns the element's class once it shows the modal.
export function swapModal(target: HTMLElement): void {
  target.innerHTML = MODAL;
  target.classList.add("htmx-settling");
  setTimeout(() => target.classList.remove("htmx-settling"), SETTLE_DELAY);
}
