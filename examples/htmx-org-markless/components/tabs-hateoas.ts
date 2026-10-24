// The tabs-hateoas demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// onGet("/tabN") answers, and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

function tabList(selected: number): string {
  const button = (n: number) =>
    n === selected
      ? `<button hx-get="/tab${n}" class="selected" aria-selected="true" autofocus role="tab" aria-controls="tab-content">Tab ${n}</button>`
      : `<button hx-get="/tab${n}" role="tab" aria-selected="false" aria-controls="tab-content">Tab ${n}</button>`;
  return `
		<div class="tab-list" role="tablist">
			${button(1)}
			${button(2)}
			${button(3)}
		</div>
`;
}

// Each tab's text, as the page's onGet("/tabN") answers carry it.
export const TAB_TEXT: readonly string[] = [
  `
			Commodo normcore truffaut VHS duis gluten-free keffiyeh iPhone taxidermy godard ramps anim pour-over.
			Pitchfork vegan mollit umami quinoa aute aliquip kinfolk eiusmod live-edge cardigan ipsum locavore.
			Polaroid duis occaecat narwhal small batch food truck.
			PBR&B venmo shaman small batch you probably haven't heard of them hot chicken readymade.
			Enim tousled cliche woke, typewriter single-origin coffee hella culpa.
			Art party readymade 90's, asymmetrical hell of fingerstache ipsum.
		`,
  `
			Kitsch fanny pack yr, farm-to-table cardigan cillum commodo reprehenderit plaid dolore cronut meditation.
			Tattooed polaroid veniam, anim id cornhole hashtag sed forage.
			Microdosing pug kitsch enim, kombucha pour-over sed irony forage live-edge.
			Vexillologist eu nulla trust fund, street art blue bottle selvage raw denim.
			Dolore nulla do readymade, est subway tile affogato hammock 8-bit.
			Godard elit offal pariatur you probably haven't heard of them post-ironic.
			Prism street art cray salvia.
		`,
  `
			Aute chia marfa echo park tote bag hammock mollit artisan listicle direct trade.
			Raw denim flexitarian eu godard etsy.
			Poke tbh la croix put a bird on it fixie polaroid aute cred air plant four loko gastropub swag non brunch.
			Iceland fanny pack tumeric magna activated charcoal bitters palo santo laboris quis consectetur cupidatat portland aliquip venmo.
		`,
];

function tabResponse(n: number): string {
  return `${tabList(n)}
		<div id="tab-content" role="tabpanel" class="tab-content">${TAB_TEXT[n - 1]}</div>`;
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
  const kept = 750 - before.length;
  if (kept <= escaped.length) return `${decodeHtml(escaped.slice(0, Math.max(0, kept)))}...`;
  // The cut falls in the markup after the code: a lone "<" stays text before the "...", a cut "</..." tag is dropped.
  const tail = after.slice(0, kept - escaped.length);
  return tail === "<" ? `${code}<...` : code;
}

export function tabEntry(n: number, tab: number): Entry {
  return getEntry(n, `/tab${tab}`, tabResponse(tab));
}

// demo.js's entry for the n-th request, a GET of url the fake server answered with response.
export function getEntry(n: number, url: string, response: string): Entry {
  const before = `<span class="activity response">
  <div>
  <b>GET</b> ${url}
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
    label: `GET ${url}`,
    method: "GET",
    url,
    params: "{}",
    headers: "{}",
    code: shownCode(before, response, "</code> </pre>\n  </div>\n</span>"),
  };
}
