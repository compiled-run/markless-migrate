// The bulk-update demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own data store and templates, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// The page's dataStore, for the visit.
const data: Record<string, { name: string; status: string }> = {
  "joe@smith.org": { name: "Joe Smith", status: "Active" },
  "angie@macdowell.org": { name: "Angie MacDowell", status: "Active" },
  "fuqua@tarkenton.org": { name: "Fuqua Tarkenton", status: "Active" },
  "kim@yee.org": { name: "Kim Yee", status: "Inactive" },
};

function displayTable(): string {
  let txt = "";
  for (const email of Object.keys(data)) {
    txt += `
<tr>
  <td>${data[email]!.name}</td>
  <td>${email}</td>
  <td>
    <input
      type="checkbox"
      name="active:${email}"
      ${data[email]!.status === "Active" ? "checked" : ""}>
  </td>
</tr>
`;
  }
  return txt;
}

// The page's displayUI(), which init("/demo") wrote into #demo-canvas.
const DISPLAY_UI = `<h3>Select Rows And Activate Or Deactivate Below</h3>
               <form
                id="checked-contacts"
                hx-post="/users"
                hx-swap="innerHTML settle:3s"
                hx-target="#toast"
              >
                <table>
                  <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Active</th>
                  </tr>
                  </thead>
                  <tbody id="tbody">
                    ${displayTable()}
                  </tbody>
                </table>
                <input type="submit" value="Bulk Update" class="btn primary">
                <output id="toast"></output>
              </form>
              <br>`;

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
  DISPLAY_UI,
  "</code></pre>\n</span>",
);

// demo.js's parseParams HTML-encodes every name and value it decodes.
const encodeParam = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The page's onPost("/users"): activates the checked users, deactivates the rest, and answers with the counts.
function postUsers(params: Record<string, string>): string {
  const actives: Record<string, boolean> = {};
  let activated = 0;
  let deactivated = 0;
  for (const param of Object.keys(params)) {
    const nameEmail = param.split(":");
    if (nameEmail[0] === "active") actives[nameEmail[1]!] = true;
  }
  for (const email of Object.keys(data)) {
    const status = actives[email] ? "Active" : "Inactive";
    if (data[email]!.status !== status) {
      data[email]!.status = status;
      if (status === "Active") activated++;
      else deactivated++;
    }
  }
  return `Activated ${activated} and deactivated ${deactivated} users`;
}

// The form's values as demo.js's parseParams reads the request body.
function formParams(form: HTMLFormElement): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) params[encodeParam(name)] = encodeParam(String(value));
  return params;
}

// The POST /users the form sends with its checked boxes, and the entry demo.js logs for it.
export function postEntry(n: number, params: Record<string, string>): { readonly response: string; readonly entry: Entry } {
  const response = postUsers(params);
  const json = JSON.stringify(params);
  const url = "/users";
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
    response,
    entry: {
      id: `req-${n}`,
      label: `POST ${url}`,
      method: "POST",
      url,
      params: decodeHtml(json),
      headers: "{}",
      code: shownCode(before, response, "</code> </pre>\n  </div>\n</span>"),
    },
  };
}

// Where an answered post goes: the page's state.
export interface UsersPage {
  form(): HTMLFormElement | undefined;
  logged(): number;
  busy(on: boolean): void;
  answer(response: string, entry: Entry): void;
}

// htmx sends one request at a time per element; a submit meanwhile waits (the last one only) and is sent, with the
// form's values then, once the fake server (which answers after 80 ms) has answered.
let inFlight = false;
let waiting: UsersPage | undefined;
export function submitUsers(page: UsersPage): void {
  if (inFlight) {
    waiting = page;
    return;
  }
  const form = page.form();
  if (!form) return;
  const params = formParams(form);
  inFlight = true;
  page.busy(true);
  setTimeout(() => {
    const { response, entry } = postEntry(page.logged() + 1, params);
    page.busy(false);
    page.answer(response, entry);
    inFlight = false;
    const next = waiting;
    waiting = undefined;
    if (next) submitUsers(next);
  }, 80);
}
