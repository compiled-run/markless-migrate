// The infinite-scroll demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own data store and templates, and demo.js's activity entries).
export interface Agent {
  readonly name: string;
  readonly email: string;
  readonly id: string;
}

export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// The page's fake server answers after 1000 ms ("longer response for more drama").
export const RESPONSE_DELAY = 1000;

// The page's dataStore: twenty contacts a page, ids counting up from 10 over the whole visit, each with a 10-character
// hash from Math.random.
export function agents(firstId: number): Agent[] {
  const possible = "ABCDEFG0123456789";
  const list: Agent[] = [];
  for (let n = 0; n < 20; n++) {
    let id = "";
    for (let i = 0; i < 10; i++) id += possible.charAt(Math.floor(Math.random() * possible.length));
    list.push({ name: "Agent Smith", email: `void${firstId + n}@null.org`, id });
  }
  return list;
}

// Before the hashes are drawn in the browser: the same rows, ids empty.
export const FIRST_PAGE: readonly Agent[] = Array.from({ length: 20 }, (_, n) => ({
  name: "Agent Smith",
  email: `void${10 + n}@null.org`,
  id: "",
}));

export function rowsTemplate(page: number, contacts: readonly Agent[]): string {
  let txt = "";
  let triggerAttributes = "";
  contacts.forEach((c, i) => {
    if (i === contacts.length - 1) triggerAttributes = ` hx-get="/contacts/?page=${page + 1}" hx-trigger="revealed" hx-swap="afterend"`;
    txt += `<tr${triggerAttributes}><td>${c.name}</td><td>${c.email}</td><td>${c.id}</td></tr>\n`;
  });
  return txt;
}

export function tableTemplate(contacts: readonly Agent[]): string {
  return `<table hx-indicator=".htmx-indicator"><thead><tr><th>Name</th><th>Email</th><th>ID</th></tr></thead><tbody>
              ${rowsTemplate(1, contacts)}
              </tbody></table><center><img class="htmx-indicator" width="60" src="/img/bars.svg" alt="Loading..."></center>`;
}

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

const INITIAL_BEFORE = `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`;

export function initialCode(contacts: readonly Agent[]): string {
  return shownCode(INITIAL_BEFORE, tableTemplate(contacts), "</code></pre>\n</span>");
}

export function responseEntry(n: number, url: string, params: Record<string, string>, response: string): Entry {
  const json = JSON.stringify(params);
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
    id: `req-${n}`,
    label: `GET ${url}`,
    method: "GET",
    url,
    params: json,
    headers: "{}",
    code: shownCode(before, response, "</code> </pre>\n  </div>\n</span>"),
  };
}
