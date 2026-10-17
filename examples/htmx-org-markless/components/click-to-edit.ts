// The click-to-edit demo's fake server and request log, as htmx.org's demo page shows them (its sinon server and demo.js templates).
export interface Contact {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly code: string;
  readonly truncated: boolean;
}

export const JOE: Contact = { firstName: "Joe", lastName: "Blow", email: "joe@blow.com" };

export function displayTemplate(contact: Contact): string {
  return `<div hx-target="this" hx-swap="outerHTML">
    <div><label>First Name</label>: ${contact.firstName}</div>
    <div><label>Last Name</label>: ${contact.lastName}</div>
    <div><label>Email Address</label>: ${contact.email}</div>
    <button hx-get="/contact/1/edit" class="btn primary">
    Click To Edit
    </button>
</div>`;
}

export function formTemplate(contact: Contact): string {
  return `<form hx-put="/contact/1" hx-target="this" hx-swap="outerHTML">
  <div>
    <label for="firstName">First Name</label>
    <input autofocus type="text" id="firstName" name="firstName" value="${contact.firstName}">
  </div>
  <div class="form-group">
    <label for="lastName">Last Name</label>
    <input type="text" id="lastName" name="lastName" value="${contact.lastName}">
  </div>
  <div class="form-group">
    <label for="email">Email Address</label>
    <input type="email" id="email" name="email" value="${contact.email}">
  </div>
  <button class="btn primary" type="submit">Submit</button>
  <button class="btn danger" hx-get="/contact/1">Cancel</button>
</form>`;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decodeHtml = (html: string) =>
  html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

export const INITIAL_HTML = displayTemplate(JOE);

// demo.js keeps the first 750 characters of an entry's HTML and adds "..."; the cut falls inside the response code here.
export function responseEntry(
  n: number,
  method: string,
  url: string,
  params: Record<string, string>,
  response: string,
): Entry {
  const json = JSON.stringify(params);
  const before = `<span class="activity response">
  <div>
  <b>${method}</b> ${url}
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
  const escaped = escapeHtml(response);
  const fits = before.length + escaped.length + "</code> </pre>\n  </div>\n</span>".length <= 750;
  const code = fits ? response : `${decodeHtml(escaped.slice(0, 750 - before.length))}...`;
  return {
    id: `req-${n}`,
    label: `${method} ${url}`,
    method,
    url,
    params: json,
    code,
    truncated: !fits,
  };
}

export function fillForm(
  fields: readonly (HTMLInputElement | undefined)[],
  contact: Contact,
): void {
  const values = [contact.firstName, contact.lastName, contact.email];
  fields.forEach((field, i) => {
    if (field) field.value = values[i]!;
  });
}
