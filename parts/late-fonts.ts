// A web font only text below every first screen draws is left out of the page's stylesheets and added once the page's scripts have arrived, or when that text nears the screen.

/** The attribute convert leaves on the blocks whose text a late face draws: the head script watches them near the screen. */
export const LATE_FONT = 'data-mm-late-font';

/**
 * Inline in the head: adds the faces the page's JSON list names (lateFontsConfig) once every script and module preload
 * the page names has arrived, or a marked block is within a screen of the viewport, whichever comes first; 30 s after
 * the load event at the latest. A face is only fetched when text it draws is laid out, so adding them all is free; an
 * idle font is preloaded then. A list a later page brings into the head (an in-place navigation) is added then.
 */
export const LATE_FONTS_SCRIPT = `(()=>{const seen=new Set();let on=false;const add=()=>{for(const s of document.querySelectorAll('script[data-mm-late-fonts]')){let faces=[];try{faces=JSON.parse(s.textContent||'[]')}catch{}for(const f of faces){const k=JSON.stringify(f);if(seen.has(k))continue;seen.add(k);if(f.href){const l=document.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='';l.href=f.href;document.head.append(l);continue}try{document.fonts.add(new FontFace(f.family,f.src,f.descriptors))}catch{}}}};const go=()=>{if(on)return;on=true;add();new MutationObserver(add).observe(document.head,{childList:true})};const arrived=()=>{const done=new Set(performance.getEntriesByType('resource').map((e)=>e.name));return[...document.querySelectorAll('link[rel=modulepreload][href],script[src]')].every((e)=>done.has(e.href||e.src))};const start=()=>{const io=new IntersectionObserver((es)=>{if(es.some((e)=>e.isIntersecting)){io.disconnect();go()}},{rootMargin:'100% 0px'});for(const el of document.querySelectorAll('[${LATE_FONT}]'))io.observe(el);if(arrived())return go();const po=new PerformanceObserver(()=>{if(arrived()){po.disconnect();go()}});po.observe({type:'resource'})};if(document.readyState==='loading')document.addEventListener('readystatechange',start,{once:true});else start();addEventListener('load',()=>setTimeout(go,30000),{once:true})})();`;

/** A web font face the page leaves out of its stylesheets, for the head script to add: FontFace's arguments. */
export interface LateFace {
	readonly family: string;
	readonly src: string;
	readonly descriptors: Readonly<Record<string, string>>;
}

/** A stylesheet's font the old page preloaded but no first screen draws: fetched at the same moment, so a pop-up's text never waits on it. */
export interface IdleFont {
	readonly href: string;
}

/** The page's late faces as the head carries them: a JSON script the head script reads. */
export const lateFontsConfig = (faces: readonly (LateFace | IdleFont)[]) => ({ attribute: 'data-mm-late-fonts', text: JSON.stringify(faces).replaceAll('<', '\\u003c') });
