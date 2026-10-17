// What Alpine's x-trap.inert.noscroll does for the mobile menu: focus moves in, the rest of the page is hidden from assistive tech, the page stops scrolling.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let hidden: Element[] = [];
let returnTo: HTMLElement | null = null;
let overflow = "";
let paddingRight = "";

export function openTrap(panel: HTMLElement | undefined): void {
  if (!panel || hidden.length) return;
  returnTo = document.activeElement as HTMLElement | null;
  for (
    let node: Element | null = panel;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || sibling.hasAttribute("aria-hidden") || sibling.tagName === "SCRIPT")
        continue;
      sibling.setAttribute("aria-hidden", "true");
      hidden.push(sibling);
    }
  }
  const html = document.documentElement;
  overflow = html.style.overflow;
  paddingRight = html.style.paddingRight;
  const scrollbar = window.innerWidth - html.clientWidth;
  html.style.overflow = "hidden";
  html.style.paddingRight = `${scrollbar}px`;
  panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

export function closeTrap(): void {
  for (const element of hidden) element.removeAttribute("aria-hidden");
  hidden = [];
  document.documentElement.style.overflow = overflow;
  document.documentElement.style.paddingRight = paddingRight;
  returnTo?.focus();
  returnTo = null;
}

export function keepFocusInside(event: KeyboardEvent, panel: HTMLElement | undefined): void {
  if (!panel) return;
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (item) => item.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0]!;
  const last = items.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
