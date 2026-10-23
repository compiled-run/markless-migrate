// The value-select (cascading selects) demo's fake server and request log, as htmx.org's demo page shows them (its sinon
// server, the page's own data store and templates, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// The page's dataStore.
const DATA: Record<string, { readonly models: readonly string[] }> = {
  audi: { models: ["A1", "A4", "A6"] },
  toyota: { models: ["Landcruiser", "Tacoma", "Yaris"] },
  bmw: { models: ["325i", "325ix", "X5"] },
};

// The page's formTemplate(), which init("/demo") wrote into #demo-canvas.
const FORM = `  <h3>Pick A Make/Model</h3>              
<form>
  <div>
    <label >Make</label>
    <select name="make" hx-get="/models" hx-target="#models" hx-indicator=".htmx-indicator">
      <option value="audi">Audi</option>
      <option value="toyota">Toyota</option>
      <option value="bmw">BMW</option>
    </select>
  </div>
  <div>
    <label>Model</label>
    <select id="models" name="model">
      <option value="a1">A1</option>
      <option value="a3">A3</option>
      <option value="a6">A6</option>
    </select>
    <img class="htmx-indicator" width="20" src="/img/bars.svg" alt="Saving...">    
  </div>
</form>`;

// The page's modelOptionsTemplate(make['models']).
const modelOptions = (models: readonly string[]) => models.map((val) => `<option value='${val}'>${val}</option>`).join("\n");

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
  FORM,
  "</code></pre>\n</span>",
);

// demo.js's parseParams HTML-encodes every value it decodes.
const encodeParam = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The GET /models the make select sends on change (htmx adds the select's own value to the URL) and the entry demo.js
// logs for it.
export function modelsEntry(n: number, make: string): { readonly models: readonly string[]; readonly entry: Entry } {
  const models = DATA[encodeParam(make)]?.models ?? [];
  const json = JSON.stringify({ make: encodeParam(make) });
  const url = `/models?${new URLSearchParams({ make })}`;
  const before = `<span class="activity response">
  <div>
  <b>GET</b> ${url}
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
    models,
    entry: {
      id: `req-${n}`,
      label: `GET ${url}`,
      method: "GET",
      url,
      params: decodeHtml(json),
      headers: "{}",
      code: shownCode(before, modelOptions(models), "</code> </pre>\n  </div>\n</span>"),
    },
  };
}

// Where an answered request goes: the page's state.
export interface ModelsPage {
  make(): string;
  logged(): number;
  busy(on: boolean): void;
  answer(models: readonly string[], entry: Entry): void;
}

// htmx sends one request at a time per element; one asked for meanwhile waits and runs, with the select's value then,
// once the fake server (which answers after 80 ms) has answered.
let inFlight = false;
let waiting: ModelsPage | undefined;
export function getModels(page: ModelsPage): void {
  if (inFlight) {
    waiting = page;
    return;
  }
  inFlight = true;
  page.busy(true);
  setTimeout(() => {
    const { models, entry } = modelsEntry(page.logged() + 1, page.make());
    page.answer(models, entry);
    page.busy(false);
    inFlight = false;
    const next = waiting;
    waiting = undefined;
    if (next) getModels(next);
  }, 80);
}
