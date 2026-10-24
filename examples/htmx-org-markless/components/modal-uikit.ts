// The UIKit modal demo's fake server, its hyperscript and its request log, as htmx.org's demo page runs them (its sinon
// server, the page's init("/demo") and onGet("/modal") routes, and demo.js's activity entries).
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
// htmx's default settle delay: the target carries htmx-settling, and the new content htmx-added, this long after the swap.
const SETTLE_DELAY = 20;
// The button's "on htmx:afterOnLoad wait 10ms then add .uk-open to #modal".
const OPEN_DELAY = 10;
// The Close button's "take .uk-open from #modal wait 200ms then remove #modal".
const REMOVE_DELAY = 200;

// What init("/demo") writes into #demo-canvas.
const DEMO_BUTTON = `
<button 
	class="uk-button uk-button-primary" 
	hx-get="/modal" 
	hx-trigger="click" 
	hx-target="#modals-here"
	_="on htmx:afterOnLoad wait 10ms then add .uk-open to #modal">Show Modal Dialog</button>`;

// onGet("/modal"): htmx swaps it into #modals-here's content.
const MODAL = `
<div id="modal" class="uk-modal" style="display:block;">
	<div class="uk-modal-dialog uk-modal-body">
		<h2 class="uk-modal-title">Modal Dialog</h2>
		<p>This modal dialog was loaded dynamically by HTMX.  You can put any server request here and you don't (necessarily) need to use the UIKit Javascript file to make it work</p>

		<form _="on submit take .uk-open from #modal">
			<div class="uk-margin">
				<input class="uk-input" placeholder="What is Your Name?">
			</div>

			<div class="uk-margin">
				<input class="uk-input" placeholder="What is Your Quest?">
			</div>

			<div class="uk-margin">
				<input class="uk-input" placeholder="What is Your Favorite Color?">
			</div>

			<button type="button" class="uk-button uk-button-primary" _="on click call alert('submit to server and close dialog.')">Save Changes</button>
			<button type="button" class="uk-button uk-button-default" _="on click take .uk-open from #modal wait 200ms then remove #modal">Close</button>
		</form>
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

// htmx's innerHTML swap into #modals-here (the new elements carry htmx-added and the target htmx-settling for the
// settle delay), then the fragment's hyperscript: the button's afterOnLoad opens it 10 ms later, Save Changes alerts,
// and Close takes .uk-open from the modal for itself, then removes the modal 200 ms later.
export function swapModal(target: HTMLElement): void {
  target.innerHTML = MODAL;
  const added = [...target.children];
  const modal = target.querySelector<HTMLElement>("#modal");
  if (!modal) return;
  const [save, close] = modal.querySelectorAll("button");
  save!.addEventListener("click", () => alert("submit to server and close dialog."));
  close!.addEventListener("click", () => {
    document.getElementById("modal")?.classList.remove("uk-open");
    close!.classList.add("uk-open");
    setTimeout(() => document.getElementById("modal")?.remove(), REMOVE_DELAY);
  });

  for (const el of added) el.classList.add("htmx-added");
  target.classList.add("htmx-settling");
  setTimeout(() => modal.classList.add("uk-open"), OPEN_DELAY);
  setTimeout(() => {
    target.classList.remove("htmx-settling");
    for (const el of added) el.classList.remove("htmx-added");
  }, SETTLE_DELAY);
}
