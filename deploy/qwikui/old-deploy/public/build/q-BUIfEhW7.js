var M=class extends Event{oldState;newState;constructor(e,{oldState:t="",newState:o="",...r}={}){super(e,r),this.oldState=String(t||""),this.newState=String(o||"")}},x=new WeakMap;function W(e,t,o){x.set(e,setTimeout(()=>{x.has(e)&&e.dispatchEvent(new M("toggle",{cancelable:!1,oldState:t,newState:o}))},0))}var H=globalThis.ShadowRoot||function(){},z=globalThis.HTMLDialogElement||function(){},b=new WeakMap,l=new WeakMap,w=new WeakMap;function E(e){return w.get(e)||"hidden"}var m=new WeakMap;function B(e){const t=e.popoverTargetElement;if(!(t instanceof HTMLElement))return;const o=E(t);e.popoverTargetAction==="show"&&o==="showing"||e.popoverTargetAction==="hide"&&o==="hidden"||(o==="showing"?g(t,!0,!0):f(t,!1)&&(m.set(t,e),D(t)))}function f(e,t){return!(e.popover!=="auto"&&e.popover!=="manual"||!e.isConnected||t&&E(e)!=="showing"||!t&&E(e)!=="hidden"||e instanceof z&&e.hasAttribute("open")||document.fullscreenElement===e)}function I(e){return e?Array.from(l.get(e.ownerDocument)||[]).indexOf(e)+1:0}function V(e){const t=q(e),o=$(e);return I(t)>I(o)?t:o}function S(e){const t=l.get(e);for(const o of t||[])if(!o.isConnected)t.delete(o);else return o;return null}function h(e){return typeof e.getRootNode=="function"?e.getRootNode():e.parentNode?h(e.parentNode):e}function q(e){for(;e;){if(e instanceof HTMLElement&&e.popover==="auto"&&w.get(e)==="showing")return e;if(e=e.parentElement||h(e),e instanceof H&&(e=e.host),e instanceof Document)return}}function $(e){for(;e;){const t=e.popoverTargetElement;if(t instanceof HTMLElement)return t;if(e=e.parentElement||h(e),e instanceof H&&(e=e.host),e instanceof Document)return}}function G(e){const t=new Map;let o=0;for(const s of l.get(e.ownerDocument)||[])t.set(s,o),o+=1;t.set(e,o),o+=1;let r=null;function i(s){const u=q(s);if(u===null)return null;const y=t.get(u);(r===null||t.get(r)<y)&&(r=u)}return i(e.parentElement||h(e)),r}function K(e){return e.hidden||e instanceof H||(e instanceof HTMLButtonElement||e instanceof HTMLInputElement||e instanceof HTMLSelectElement||e instanceof HTMLTextAreaElement||e instanceof HTMLOptGroupElement||e instanceof HTMLOptionElement||e instanceof HTMLFieldSetElement)&&e.disabled||e instanceof HTMLInputElement&&e.type==="hidden"||e instanceof HTMLAnchorElement&&e.href===""?!1:typeof e.tabIndex=="number"&&e.tabIndex!==-1}function Q(e){if(e.shadowRoot&&e.shadowRoot.delegatesFocus!==!0)return null;let t=e;t.shadowRoot&&(t=t.shadowRoot);let o=t.querySelector("[autofocus]");if(o)return o;{const s=t.querySelectorAll("slot");for(const u of s){const y=u.assignedElements({flatten:!0});for(const n of y){if(n.hasAttribute("autofocus"))return n;if(o=n.querySelector("[autofocus]"),o)return o}}}const r=e.ownerDocument.createTreeWalker(t,NodeFilter.SHOW_ELEMENT);let i=r.currentNode;for(;i;){if(K(i))return i;i=r.nextNode()}}function U(e){Q(e)?.focus()}var A=new WeakMap;function D(e){if(!f(e,!1))return;const t=e.ownerDocument;if(!e.dispatchEvent(new M("beforetoggle",{cancelable:!0,oldState:"closed",newState:"open"}))||!f(e,!1))return;let o=!1;if(e.popover==="auto"){const i=e.getAttribute("popover"),s=G(e)||t;if(L(s,!1,!0),i!==e.getAttribute("popover")||!f(e,!1))return}S(t)||(o=!0),A.delete(e);const r=t.activeElement;e.classList.add(":popover-open"),w.set(e,"showing"),b.has(t)||b.set(t,new Set),b.get(t).add(e),U(e),e.popover==="auto"&&(l.has(t)||l.set(t,new Set),l.get(t).add(e),C(m.get(e),!0)),o&&r&&e.popover==="auto"&&A.set(e,r),W(e,"closed","open")}function g(e,t=!1,o=!1){if(!f(e,!0))return;const r=e.ownerDocument;if(e.popover==="auto"&&(L(e,t,o),!f(e,!0))||(C(m.get(e),!1),m.delete(e),o&&(e.dispatchEvent(new M("beforetoggle",{oldState:"open",newState:"closed"})),!f(e,!0))))return;b.get(r)?.delete(e),l.get(r)?.delete(e),e.classList.remove(":popover-open"),w.set(e,"hidden"),o&&W(e,"open","closed");const i=A.get(e);i&&(A.delete(e),t&&i.focus())}function F(e,t=!1,o=!1){let r=S(e);for(;r;)g(r,t,o),r=S(e)}function L(e,t,o){const r=e.ownerDocument||e;if(e instanceof Document)return F(r,t,o);let i=null,s=!1;for(const u of l.get(r)||[])if(u===e)s=!0;else if(s){i=u;break}if(!s)return F(r,t,o);for(;i&&E(i)==="showing"&&l.get(r)?.size;)g(i,t,o)}var k=new WeakMap;function N(e){if(!e.isTrusted)return;const t=e.composedPath()[0];if(!t)return;const o=t.ownerDocument;if(!S(o))return;const i=V(t);if(i&&e.type==="pointerdown")k.set(o,i);else if(e.type==="pointerup"){const s=k.get(o)===i;k.delete(o),s&&L(i||o,!1,!0)}}var T=new WeakMap;function C(e,t=!1){if(!e)return;T.has(e)||T.set(e,e.getAttribute("aria-expanded"));const o=e.popoverTargetElement;if(o instanceof HTMLElement&&o.popover==="auto")e.setAttribute("aria-expanded",String(t));else{const r=T.get(e);r?e.setAttribute("aria-expanded",r):e.removeAttribute("aria-expanded")}}var O=globalThis.ShadowRoot||function(){};function _(){return typeof HTMLElement<"u"&&typeof HTMLElement.prototype=="object"&&"popover"in HTMLElement.prototype}function c(e,t,o){const r=e[t];Object.defineProperty(e,t,{value(i){return r.call(this,o(i))}})}var J=/(^|[^\\]):popover-open\b/g;function X(){return typeof globalThis.CSSLayerBlockRule=="function"}function Y(){const e=X();return`
${e?"@layer popover-polyfill {":""}
  :where([popover]) {
    position: fixed;
    z-index: 2147483647;
    inset: 0;
    padding: 0.25em;
    width: fit-content;
    height: fit-content;
    border-width: initial;
    border-color: initial;
    border-image: initial;
    border-style: solid;
    background-color: canvas;
    color: canvastext;
    overflow: auto;
    margin: auto;
  }

  :where([popover]:not(.\\:popover-open)) {
    display: none;
  }

  :where(dialog[popover].\\:popover-open) {
    display: block;
  }

  :where(dialog[popover][open]) {
    display: revert;
  }

  :where([anchor].\\:popover-open) {
    inset: auto;
  }

  :where([anchor]:popover-open) {
    inset: auto;
  }

  @supports not (background-color: canvas) {
    :where([popover]) {
      background-color: white;
      color: black;
    }
  }

  @supports (width: -moz-fit-content) {
    :where([popover]) {
      width: -moz-fit-content;
      height: -moz-fit-content;
    }
  }

  @supports not (inset: 0) {
    :where([popover]) {
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }
${e?"}":""}
`}var d=null;function P(e){const t=Y();if(d===null)try{d=new CSSStyleSheet,d.replaceSync(t)}catch{d=!1}if(d===!1){const o=document.createElement("style");o.textContent=t,e instanceof Document?e.head.prepend(o):e.prepend(o)}else e.adoptedStyleSheets=[d,...e.adoptedStyleSheets]}function Z(){if(typeof window>"u")return;window.ToggleEvent=window.ToggleEvent||M;function e(n){return n?.includes(":popover-open")&&(n=n.replace(J,"$1.\\:popover-open")),n}c(Document.prototype,"querySelector",e),c(Document.prototype,"querySelectorAll",e),c(Element.prototype,"querySelector",e),c(Element.prototype,"querySelectorAll",e),c(Element.prototype,"matches",e),c(Element.prototype,"closest",e),c(DocumentFragment.prototype,"querySelectorAll",e),c(DocumentFragment.prototype,"querySelectorAll",e),Object.defineProperties(HTMLElement.prototype,{popover:{enumerable:!0,configurable:!0,get(){if(!this.hasAttribute("popover"))return null;const n=(this.getAttribute("popover")||"").toLowerCase();return n===""||n=="auto"?"auto":"manual"},set(n){this.setAttribute("popover",n)}},showPopover:{enumerable:!0,configurable:!0,value(){D(this)}},hidePopover:{enumerable:!0,configurable:!0,value(){g(this,!0,!0)}},togglePopover:{enumerable:!0,configurable:!0,value(n){w.get(this)==="showing"&&n===void 0||n===!1?g(this,!0,!0):(n===void 0||n===!0)&&D(this)}}});const t=Element.prototype.attachShadow;t&&Object.defineProperties(Element.prototype,{attachShadow:{enumerable:!0,configurable:!0,writable:!0,value(n){const a=t.call(this,n);return P(a),a}}});const o=HTMLElement.prototype.attachInternals;o&&Object.defineProperties(HTMLElement.prototype,{attachInternals:{enumerable:!0,configurable:!0,writable:!0,value(){const n=o.call(this);return n.shadowRoot&&P(n.shadowRoot),n}}});const r=new WeakMap;function i(n){Object.defineProperties(n.prototype,{popoverTargetElement:{enumerable:!0,configurable:!0,set(a){if(a===null)this.removeAttribute("popovertarget"),r.delete(this);else if(a instanceof Element)this.setAttribute("popovertarget",""),r.set(this,a);else throw new TypeError("popoverTargetElement must be an element or null")},get(){if(this.localName!=="button"&&this.localName!=="input"||this.localName==="input"&&this.type!=="reset"&&this.type!=="image"&&this.type!=="button"||this.disabled||this.form&&this.type==="submit")return null;const a=r.get(this);if(a&&a.isConnected)return a;if(a&&!a.isConnected)return r.delete(this),null;const p=h(this),v=this.getAttribute("popovertarget");return(p instanceof Document||p instanceof O)&&v&&p.getElementById(v)||null}},popoverTargetAction:{enumerable:!0,configurable:!0,get(){const a=(this.getAttribute("popovertargetaction")||"").toLowerCase();return a==="show"||a==="hide"?a:"toggle"},set(a){this.setAttribute("popovertargetaction",a)}}})}i(HTMLButtonElement),i(HTMLInputElement);const s=n=>{const a=n.composedPath(),p=a[0];if(!(p instanceof Element)||p?.shadowRoot)return;const v=h(p);if(!(v instanceof O||v instanceof Document))return;const R=a.find(j=>j.matches?.("[popovertargetaction],[popovertarget]"));if(R){B(R),n.preventDefault();return}},u=n=>{const a=n.key,p=n.target;!n.defaultPrevented&&p&&(a==="Escape"||a==="Esc")&&L(p.ownerDocument,!0,!0)};(n=>{n.addEventListener("click",s),n.addEventListener("keydown",u),n.addEventListener("pointerdown",N),n.addEventListener("pointerup",N)})(document),P(document)}_()||Z();
