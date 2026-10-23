// The delete-row demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own contacts and templates, and demo.js's activity entries).
export interface Contact {
  readonly name: string;
  readonly email: string;
  readonly status: string;
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

// The page's contacts.
export const CONTACTS: readonly Contact[] = [
  { name: "Joe Smith", email: "joe@smith.org", status: "Active" },
  { name: "Angie MacDowell", email: "angie@macdowell.org", status: "Active" },
  { name: "Fuqua Tarkenton", email: "fuqua@tarkenton.org", status: "Active" },
  { name: "Kim Yee", email: "kim@yee.org", status: "Inactive" },
];

function rowTemplate(contact: Contact, i: number): string {
  return `<tr>
      <td>${contact.name}</td>
      <td>${contact.email}</td>
      <td>${contact.status}</td>
      <td>
        <button class="btn danger" hx-delete="/contact/${i}">
          Delete
        </button>
      </td>
    </tr>`;
}

// The page's tableTemplate(), which init("/demo") wrote into #demo-canvas.
function tableTemplate(contacts: readonly Contact[]): string {
  let rows = "";
  for (let i = 0; i < contacts.length; i++) rows += rowTemplate(contacts[i]!, i);
  return `
<table class="table delete-row-example">
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Status</th>
      <th></th>
    </tr>
  </thead>
  <tbody hx-confirm="Are you sure?" hx-target="closest tr" hx-swap="outerHTML swap:1s">
    ${rows}
  </tbody>
</table>`;
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

export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  tableTemplate(CONTACTS),
  "</code></pre>\n</span>",
);

// The page's onDelete(/\/contact\/\d+/) answers with nothing, which replaces the row with nothing.
export function deleteEntry(n: number, i: number): Entry {
  const url = `/contact/${i}`;
  return {
    id: `req-${n}`,
    label: `DELETE ${url}`,
    method: "DELETE",
    url,
    params: "{}",
    headers: "{}",
    code: "",
  };
}
