import { parseFragment } from 'parse5';
import { childrenOf, isElement, type Element } from './dom.ts';

const guard = (n: Element) => n.attrs.some((a) => /^data-[\w-]*focus-guard$/.test(a.name));

/**
 * What opening a control put beside it on the old page, less the focus guards its Markless port replaces. Floating
 * UI's `<span aria-owns>` (Base UI's portals) stays: it places the portal's content after the trigger in the
 * accessibility tree. `guards`: Base UI's focus guards too (useTriggerFocusGuards' pair around the trigger and
 * FloatingPortal's outside pair), tab stops beside the trigger while it is open, which base-ui/popup.ts moves on from.
 */
export const besideTrigger = (html: string, guards = false): Element[] => childrenOf(parseFragment(html) as unknown as Element).filter((n): n is Element => isElement(n) && (!guard(n) || (guards && n.attrs.some((a) => a.name === 'data-base-ui-focus-guard'))));
