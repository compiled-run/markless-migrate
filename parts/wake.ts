// The old page's window listeners, heard before any part is loaded: the first scroll, and a key pressed with focus outside
// the page's roots (each until the parts are in: a shortcut is a modifier then a key), go to a root as an mmwake event,
// which loads the parts; behave then plays the event again for the listeners listen() adds. Once listen() has run
// (__mmAwake), the parts' own listeners hear everything.
export const WAKE_SCRIPT = `{let s=0;const f=(d)=>{const r=globalThis.__mmAwake?null:document.querySelector('[data-mm-wake]');if(r)r.dispatchEvent(new CustomEvent('mmwake',{bubbles:true,detail:d}))};addEventListener('scroll',()=>{if(!s++)f({type:'scroll'})},{passive:true});addEventListener('keydown',(e)=>{if(!(e.target instanceof Element&&e.target.closest('[data-mm-wake]')))f({type:'keydown',init:{key:e.key,code:e.code,metaKey:e.metaKey,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey}})})}`;
