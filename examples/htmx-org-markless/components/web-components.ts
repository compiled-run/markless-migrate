// The web-components demo's fake server, custom element and request log, as htmx.org's demo page shows them (its sinon
// server, the page's own <my-component> and onGet("/my-component-clicked"), and demo.js's activity entries).
export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly code: string;
}

// demo.js: server.autoRespondAfter = 80.
export const RESPONSE_DELAY = 80;
// htmx's default settle delay: the target carries htmx-settling (and its new content htmx-added) this long after the swap.
export const SETTLE_DELAY = 20;

// What init("/demo") wrote into #demo-canvas, shown as the timeline's initial state.
export const INITIAL_CODE = "<my-component></my-component>";

// onGet("/my-component-clicked"), with the page's timesClicked.
export const clickedResponse = (times: number) => `<p>Clicked ${times} time${times > 1 ? "s" : ""}!</p>`;

export function clickedEntry(n: number): Entry {
  return { id: `req-${n}`, label: "GET /my-component-clicked", code: clickedResponse(n) };
}

// The event <my-component> fires on itself when the fake server answers its button's GET; the page fills in the
// response (and logs the request), which the element then swaps into its div.
export const CLICKED_EVENT = "my-component-clicked";
export interface ClickedDetail {
  response?: string;
}

// The page's own custom element: a closed shadow root with a button whose hx-get="/my-component-clicked"
// hx-target="next div" puts the answer into the div after it. The button carries htmx-request until the answer is
// swapped in; a click while the request is out waits and runs once it is answered, as htmx's default hx-sync queues the
// last.
export function defineMyComponent(): void {
  if (customElements.get("my-component")) return;
  customElements.define(
    "my-component",
    class MyComponent extends HTMLElement {
      #root?: ShadowRoot;
      connectedCallback() {
        if (this.#root) return;
        const root = (this.#root = this.attachShadow({ mode: "closed" }));
        root.innerHTML = `
        <button hx-get="/my-component-clicked" hx-target="next div">Click me!</button>
        <div></div>
      `;
        const button = root.querySelector("button")!;
        const target = root.querySelector("div")!;
        let inFlight = false;
        let queued = false;
        const get = () => {
          if (inFlight) {
            queued = true;
            return;
          }
          inFlight = true;
          button.classList.add("htmx-request");
          setTimeout(() => {
            const detail: ClickedDetail = {};
            this.dispatchEvent(new CustomEvent(CLICKED_EVENT, { bubbles: true, detail }));
            if (detail.response !== undefined) {
              target.classList.add("htmx-swapping");
              target.innerHTML = detail.response;
              target.classList.remove("htmx-swapping");
              const added = [...target.children];
              target.classList.add("htmx-settling");
              for (const child of added) child.classList.add("htmx-added");
              setTimeout(() => {
                target.classList.remove("htmx-settling");
                for (const child of added) child.classList.remove("htmx-added");
              }, SETTLE_DELAY);
            }
            button.classList.remove("htmx-request");
            inFlight = false;
            if (queued) {
              queued = false;
              get();
            }
          }, RESPONSE_DELAY);
        };
        button.addEventListener("click", get);
      }
    },
  );
}
