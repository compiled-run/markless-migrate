import { parseFragment } from 'parse5';
import { childrenOf, isElement, type Element } from './dom.ts';

/**
 * What opening a control put beside it on the old page, less the focus guards its Markless port replaces. Floating
 * UI's `<span aria-owns>` (Base UI's portals) stays: it places the portal's content after the trigger in the
 * accessibility tree.
 */
export const besideTrigger = (html: string): Element[] => childrenOf(parseFragment(html) as unknown as Element).filter((n): n is Element => isElement(n) && !n.attrs.some((a) => /^data-[\w-]*focus-guard$/.test(a.name)));
