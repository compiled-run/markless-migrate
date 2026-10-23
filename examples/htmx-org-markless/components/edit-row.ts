// The edit-row demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own contacts and templates, and demo.js's activity entries).
export interface Contact {
  readonly name: string;
  readonly email: string;
}

// A contact's row: its id, and whether htmx has swapped it to the edit form.
export interface Row extends Contact {
  readonly id: number;
  readonly editing: boolean;
}

// The page's contacts.
export const CONTACTS: readonly Contact[] = [
  { name: "Joe Smith", email: "joe@smith.org" },
  { name: "Angie MacDowell", email: "angie@macdowell.org" },
  { name: "Fuqua Tarkenton", email: "fuqua@tarkenton.org" },
  { name: "Kim Yee", email: "kim@yee.org" },
];

// demo.js's encodeHTML, which it runs on every parameter the fake server reads (so a saved contact holds it).
const encodeParam = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The page's rowTemplate(), editTemplate() and tableTemplate(), with what the server held for each contact.
export function rowTemplate({ id, ...contact }: Contact & { readonly id: number }): string {
  return `<tr>
      <td>${encodeParam(contact.name)}</td>
      <td>${encodeParam(contact.email)}</td>
      <td>
        <button class="btn danger"
                hx-get="/contact/${id}/edit"
                hx-trigger="edit"
                onClick="let editing = document.querySelector('.editing')
                         if(editing) {
                           Swal.fire({title: 'Already Editing',
                                      showCancelButton: true,
                                      confirmButtonText: 'Yep, Edit This Row!',
                                      text:'Hey!  You are already editing a row!  Do you want to cancel that edit and continue?'})
                           .then((result) => {
                                if(result.isConfirmed) {
                                   htmx.trigger(editing, 'cancel')
                                   htmx.trigger(this, 'edit')
                                }
                            })
                         } else {
                            htmx.trigger(this, 'edit')
                         }">
          Edit
        </button>
      </td>
    </tr>`;
}

export function editTemplate({ id, ...contact }: Contact & { readonly id: number }): string {
  return `<tr hx-trigger='cancel' class='editing' hx-get="/contact/${id}">
      <td><input autofocus name='name' value='${encodeParam(contact.name)}'</td>
      <td><input name='email' value='${encodeParam(contact.email)}'</td>
      <td>
        <button class="btn danger" hx-get="/contact/${id}">
          Cancel
        </button>
        <button class="btn danger" hx-put="/contact/${id}" hx-include="closest tr">
          Save
        </button>
      </td>
    </tr>`;
}

function tableTemplate(contacts: readonly Contact[]): string {
  let rows = "";
  for (let i = 0; i < contacts.length; i++) rows += rowTemplate({ ...contacts[i]!, id: i });
  return `
<table class="table delete-row-example">
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th></th>
    </tr>
  </thead>
  <tbody hx-target="closest tr" hx-swap="outerHTML">
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

const INITIAL_BEFORE = `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`;

// demo.js keeps the first 750 characters of the initial entry's HTML and adds "..."; the cut falls inside the code.
export const INITIAL_CODE = `${decodeHtml(escapeHtml(tableTemplate(CONTACTS)).slice(0, 750 - INITIAL_BEFORE.length))}...`;

// demo.js's demoResponseTemplate() for an answer of the fake server, cut to 750 characters as pushActivityChip cuts it;
// the HTML the request log inserts, as demo.js inserted it.
export function responseHtml(method: string, url: string, params: Record<string, string>, response: string): string {
  const encoded = Object.fromEntries(Object.entries(params).map(([k, v]) => [encodeParam(k), encodeParam(v)]));
  const content = `<span class="activity response">
  <div>
  <b>${method}</b> ${url}
  </div>
  <div>
    parameters: ${JSON.stringify(encoded)}
  </div>
  <div>
    headers: {}
  </div>
  <div>
  <b>Response</b>
  <pre class="language-html"><code class="language-html">${escapeHtml(response)}</code> </pre>
  </div>
</span>`;
  return content.length > 750 ? `${content.slice(0, 750)}...` : content;
}

// demo.js's showTimelineEntry(): shows the entry with this id and marks its timeline link.
export function showEntry(timeline: HTMLElement, current: HTMLElement, id: string): void {
  for (const child of current.children) child.classList.toggle("hide", child.id !== id);
  for (const child of timeline.children) child.classList.toggle("active", child.id === `${id}-link`);
}

// demo.js's pushActivityChip(): the newest entry goes first in the timeline and the request view, and is shown.
export function pushEntry(timeline: HTMLElement, current: HTMLElement, name: string, id: string, html: string): void {
  timeline.insertAdjacentHTML("afterbegin", `<li id="${id}-link"><a style="cursor: pointer">${name}</a></li>`);
  current.insertAdjacentHTML("afterbegin", `<div id="${id}">${html}</div>`);
  showEntry(timeline, current, id);
}
