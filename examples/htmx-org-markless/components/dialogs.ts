// The dialogs demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own templates, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// The page's submitButton(), which init("/demo") wrote into #demo-canvas.
const SUBMIT_BUTTON = `<div>
  <button class="btn primary"
          hx-post="/submit"
          hx-prompt="Enter a string"
          hx-confirm="Are you sure?"
          hx-target="#response">
    Prompt Submission
  </button>
  <div id="response"></div>
</div>`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', nbsp: " " };
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
  SUBMIT_BUTTON,
  "</code></pre>\n</span>",
);

// The page's onPost("/submit") echoes the HX-Prompt request header in promptSubmit(); the button sends no body, and
// demo.js lists only the response's hx- headers, of which there are none.
export function submitEntry(n: number, response: string): Entry {
  const before = `<span class="activity response">
  <div>
  <b>POST</b> /submit
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
  return {
    id: `req-${n}`,
    label: "POST /submit",
    method: "POST",
    url: "/submit",
    params: "{}",
    headers: "{}",
    code: shownCode(before, `User entered <i>${response}</i>`, "</code> </pre>\n  </div>\n</span>"),
  };
}
