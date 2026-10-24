// A block whose text is drawn by a web font no first screen uses renders after the page's load event, so that font is fetched after the load.

/** The attribute convert leaves on a block whose rendering waits for the page's load event. */
export const LATE_FONT = 'data-mm-late-font';

/**
 * Inline in the head: the marked blocks are not rendered until the page's load event, so the web font only their text
 * uses (a script's face for a demo far down the page) is fetched after the load instead of competing with the first
 * screen. Lifted at load, and for good: content swapped in later renders as it arrives.
 */
export const LATE_FONTS_SCRIPT = `(()=>{const s=document.createElement('style');s.textContent='[${LATE_FONT}]{content-visibility:hidden}';document.head.appendChild(s);addEventListener('load',()=>s.remove(),{once:true})})();`;
