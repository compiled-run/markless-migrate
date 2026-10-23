// The reset-user-input demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the
// page's own templates, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
  readonly truncated: boolean;
}

// demo.js's parseParams HTML-encodes every key and value it decodes; the page's route sees the encoded text.
const encodeParam = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The page's formTemplate(), which init("/demo") wrote into #demo-canvas.
const FORM_TEMPLATE = `
<form hx-post="/note" hx-target="#notes" hx-swap="afterbegin" hx-on::after-request="if(event.detail.successful) this.reset()">
    <div class="form-group">
        <label>Add a note</label>
        <input type="text" name="note-text" placeholder="blank canvas">
    </div>
    <button class="btn primary">Add</button>
</form>
<ul id="notes"> </ul>`;

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', nbsp: "\u00a0" };
// What the browser makes of escaped text cut short: whole entities, and lt, gt and amp without their semicolon at the cut.
const decodeHtml = (html: string) =>
  html.replace(/&(lt|gt|amp|quot|nbsp)(;|$)/g, (whole, name: string, end: string) =>
    end || name !== "quot" ? ENTITIES[name]! : whole,
  );

// demo.js keeps the first 750 characters of an entry's HTML and adds "..."; returns the code the entry then shows.
function shownCode(
  before: string,
  code: string,
  after: string,
): { readonly code: string; readonly truncated: boolean } {
  const escaped = escapeHtml(code);
  if (before.length + escaped.length + after.length <= 750) return { code, truncated: false };
  return {
    code: `${decodeHtml(escaped.slice(0, Math.max(0, 750 - before.length)))}...`,
    truncated: true,
  };
}

export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  FORM_TEMPLATE,
  "</code></pre>\n</span>",
).code;

// The form's POST /note with its fields, the page's onPost("/note") answer (a list item for a note, nothing for an
// empty one) and the entry demo.js logs for it; `note` is the list item's text, or null when there is none.
export function postNote(
  n: number,
  fields: readonly (readonly [string, string])[],
): { readonly note: string | null; readonly entry: Entry } {
  const params: Record<string, string> = {};
  for (const [name, value] of fields) params[encodeParam(name)] = encodeParam(value);
  const note = params["note-text"];
  const response = note ? `<li>${note}</li>` : "";
  const json = JSON.stringify(params);
  const url = "/note";
  const before = `<span class="activity response">
  <div>
  <b>POST</b> ${url}
  </div>
  <div>
    parameters: ${json}
  </div>
  <div>
    headers: {}
  </div>
  <div>
  <b>Response</b>
  <pre class="language-html"><code class="language-html">`;
  const shown = shownCode(before, response, "</code> </pre>\n  </div>\n</span>");
  return {
    note: note ? decodeHtml(note) : null,
    entry: {
      id: `req-${n}`,
      label: `POST ${url}`,
      method: "POST",
      url,
      params: decodeHtml(json),
      headers: "{}",
      code: shown.code,
      truncated: shown.truncated,
    },
  };
}
