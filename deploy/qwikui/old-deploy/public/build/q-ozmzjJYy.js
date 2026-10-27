import{h as i,a as r,r as m,z as l,k as t,N as s,c as _,E as d,D as p}from"./q-CsvfasCP.js";import{_ as n}from"./q-BKZ00VYc.js";import{f}from"./q-JFFmWO-j.js";import{c as g}from"./q-DW7wgCba.js";import{g as y,a as v}from"./q-BfcsEmii.js";const b=()=>{const[e]=i();e.value?.style.setProperty("--dynamic-banner-height",`-${e.value?.offsetHeight+64}px`),e.value?.classList.toggle("fade")},S=Object.freeze(Object.defineProperty({__proto__:null,s_7typnKlzjQo:b},Symbol.toStringTag,{value:"Module"})),z=e=>{const a=r(),o=r(!1);return m(s(()=>n(()=>Promise.resolve().then(()=>h),void 0),"s_cz2RUYCO3YI")),l(p,{children:t("div",{ref:a,class:g(v(e.status),"normal-state rounded-base relative border-2 px-8 py-6 md:flex-row md:items-center 2xl:-mx-8")},{hidden:d((c,u)=>c.value||!u.status,[o,e]),style:{marginBottom:"64px"},onAnimationEnd$:s(()=>n(()=>Promise.resolve().then(()=>B),void 0),"s_sVv9QWyX8l8",[o])},[t("span",null,{class:"pr-2"},y(e.status),1,null),t("button",null,{"aria-label":"close status banner",class:"absolute top-2 right-2 scale-150",onClick$:s(()=>n(()=>Promise.resolve().then(()=>S),void 0),"s_7typnKlzjQo",[a])},l(f,{class:"size-3",[_]:{class:_}},3,"IF_5"),1,null)],1,null)},1,"IF_6")},C=Object.freeze(Object.defineProperty({__proto__:null,s_Uinz2GcP8VM:z},Symbol.toStringTag,{value:"Module"})),O=()=>{const[e]=i();return e.value=!0},B=Object.freeze(Object.defineProperty({__proto__:null,s_sVv9QWyX8l8:O},Symbol.toStringTag,{value:"Module"})),P=`

  .normal-state {
    transition: margin-top 0.5s ease;
  }

  .fade {
    animation: fadeOut 1s cubic-bezier(0.6, 0.6, 0, 1) forwards;
    margin-top: var(--dynamic-banner-height);
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  `,h=Object.freeze(Object.defineProperty({__proto__:null,s_cz2RUYCO3YI:P},Symbol.toStringTag,{value:"Module"}));export{C as s,b as s_7typnKlzjQo,z as s_Uinz2GcP8VM,P as s_cz2RUYCO3YI,O as s_sVv9QWyX8l8};
