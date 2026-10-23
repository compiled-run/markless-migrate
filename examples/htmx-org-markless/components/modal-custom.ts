// The custom modal demo's fake server answer and its hyperscript, as htmx.org's demo page runs them (its sinon server
// and the page's init("/modal") route).

// demo.js: server.autoRespondAfter = 80.
export const RESPONSE_DELAY = 80;
// htmx's default settle delay: the target carries htmx-settling, and the new content htmx-added, this long after the swap.
const SETTLE_DELAY = 20;

// init("/modal"), its hyperscript attributes kept as markup: hx-swap="beforeend" adds it, whitespace included, at the end of hx-target="body".
const MODAL = `
		<div id="modal" _="on closeModal add .closing wait for animationend then remove me">
			<div class="modal-underlay" _="on click trigger closeModal"></div>
			<div class="modal-content">
				<h1>Modal Dialog</h1>
				This is the modal content.
				You can put anything here, like text, or a form, or an image.
				<br>
				<br>
				<button class="btn danger" _="on click trigger closeModal">Close</button>
			</div>
		</div>
		`;

// htmx's beforeend swap into the body, then the fragment's hyperscript: the underlay and the Close button
// "on click trigger closeModal", and the modal "on closeModal add .closing wait for animationend then remove me".
export function appendModal(): void {
  const body = document.body;
  const before = body.lastChild;
  body.insertAdjacentHTML("beforeend", MODAL);
  const added: Element[] = [];
  for (let node = before ? before.nextSibling : body.firstChild; node; node = node.nextSibling) {
    if (node instanceof Element) added.push(node);
  }
  const modal = added.find((el) => el.id === "modal");
  if (!modal) return;
  const trigger = (event: Event) => event.currentTarget!.dispatchEvent(new CustomEvent("closeModal", { bubbles: true }));
  modal.querySelector(".modal-underlay")!.addEventListener("click", trigger);
  modal.querySelector("button")!.addEventListener("click", trigger);
  modal.addEventListener("closeModal", () => {
    modal.classList.add("closing");
    modal.addEventListener("animationend", () => modal.remove(), { once: true });
  });

  for (const el of added) el.classList.add("htmx-added");
  body.classList.add("htmx-settling");
  setTimeout(() => {
    body.classList.remove("htmx-settling");
    for (const el of added) {
      el.classList.remove("htmx-added");
      if (!el.classList.length) el.removeAttribute("class");
    }
  }, SETTLE_DELAY);
}
