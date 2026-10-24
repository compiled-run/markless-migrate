// The sortable demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own list and templates, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

export const FIRST_ITEMS: readonly string[] = ["1", "2", "3", "4", "5"];

// The page's listContents().
function listContents(items: readonly string[]): string {
  return (
    '<div class="htmx-indicator" style="cursor: default">Updating...</div>' +
    items
      .map(
        (val) =>
          `  <div style="border:1px solid #DEDEDE; padding:12px; margin: 8px; width:200px; cursor: grab" ondrag="this.style.cursor = 'grabbing'" ><input type="hidden" name="item" value="` +
          val +
          `"/> Item ` +
          val +
          `</div>`,
      )
      .join("\n")
  );
}

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

// What init("/demo") wrote into #demo-canvas.
export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  '<form id="example1" class="list-group col sortable" hx-post="/items" hx-trigger="end">' +
    listContents(FIRST_ITEMS) +
    "\n</form>",
  "</code></pre>\n</span>",
);

// demo.js's parseParams HTML-encodes every value it decodes.
const encodeParam = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The item ids in the order the form sends them (its hidden inputs, as Sortable left them).
export function formItems(form: HTMLFormElement): string[] {
  return new FormData(form).getAll("item").map((value) => encodeParam(String(value)));
}

// The POST /items the form sends when Sortable fires "end", and the entry demo.js logs for it.
export function postEntry(n: number, items: readonly string[]): Entry {
  // parseParams makes a repeated name an array and leaves a single one a string.
  const params = { item: items.length === 1 ? items[0] : items };
  const json = JSON.stringify(params);
  const url = "/items";
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
  return {
    id: `req-${n}`,
    label: `POST ${url}`,
    method: "POST",
    url,
    params: decodeHtml(json),
    headers: "{}",
    code: shownCode(before, listContents(items), "</code> </pre>\n  </div>\n</span>"),
  };
}
