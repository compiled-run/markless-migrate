import{h as u,f as g,a as k,n as v,z as s,c as e,k as o,E as _,N as l}from"./q-CsvfasCP.js";import{v as y,a as S}from"./q-DwPYB7WY.js";import{_ as n}from"./q-BKZ00VYc.js";import{b,B as x}from"./q-DDtaMfdi.js";import{D as w}from"./q-Cs0BlHg3.js";import{D as H}from"./q-Bnvp3PGt.js";import{D as O}from"./q-Cr2gTCBe.js";import{G as I}from"./q-BrILMMeu.js";import{L,a as z,M as D}from"./q-CWde75BG.js";import{l as j,f as M}from"./q-JFFmWO-j.js";import{S as P}from"./q-Csy3F37L.js";import{c}from"./q-DW7wgCba.js";import{u as G}from"./q-BfZAaTW8.js";import{useKitMenuItems as T}from"./q-CzWJgxqR.js";import{a as A}from"./q-F28AP3L4.js";import{u as R}from"./q-NmU6Zr0d.js";import{H as E}from"./q-DS1eJM9B.js";import{H as V}from"./q-Cbp5q_tc.js";const F=()=>{const[t]=u();if(t.url.pathname.startsWith("/docs/headless"))return{name:"Headless",version:y};if(t.url.pathname.startsWith("/docs/styled"))return{name:"Styled",version:S}},q=Object.freeze(Object.defineProperty({__proto__:null,s_wp5ADZk9oYk:F},Symbol.toStringTag,{value:"Module"})),C=()=>{const[t]=u();return t.value=!1},U=Object.freeze(Object.defineProperty({__proto__:null,s_eiqSMtRht5U:C},Symbol.toStringTag,{value:"Module"})),Q=t=>{g(l(()=>n(()=>Promise.resolve().then(()=>X),void 0),"s_FVkLLDqgxdc"));const r=T(),p=G(),i=k(!1),d=A(),m=a=>`
        transition-color ease-step duration-300 ${d.url.pathname.startsWith(a)?"font-bold":""}`,f=v(l(()=>n(()=>Promise.resolve().then(()=>q),void 0),"s_wp5ADZk9oYk",[d])),h=R();return s(V,{class:c("sticky top-0 z-10 flex h-16 justify-center border-b bg-background",h.themeSig.value?.includes("brutalist")&&"border-b-2"),"bind:show":i,children:[o("header",null,{class:"flex w-full items-center justify-between"},[o("section",null,{class:"flex items-center justify-start"},[o("a",null,{href:"/","aria-label":"Qwik UI Logo",class:"ml-4"},[s(L,{class:"hidden sm:block",[e]:{class:e}},3,"Hu_0"),s(z,{class:"block sm:hidden",[e]:{class:e}},3,"Hu_1")],1,null),(t.showVersion??!1)&&o("div",null,{class:"ml-4 hidden text-xs md:flex"},_(a=>a.value?.name&&a.value?.name+" "+a.value?.version,[f]),3,"Hu_2")],1,null),o("div",null,{class:"mr-4 flex items-center"},[o("div",null,{class:"mr-6 hidden items-center space-x-8 text-sm lg:flex"},[o("a",{class:m("/docs/headless/")},{href:"/docs/headless/introduction/"},"Headless",3,null),p.featureFlags?.showStyled&&o("a",{class:m("/docs/styled/")},{href:"/docs/styled/introduction/"},"Styled",3,"Hu_3")],1,null),o("div",null,{class:"xs:space-x-4 flex items-center space-x-1"},[s(D,null,3,"Hu_4"),s(P,null,3,"Hu_5"),o("a",null,{href:"https://discord.gg/PVWUUejrez",target:"_blank",class:c(b({size:"icon",look:"ghost"}))},s(H,null,3,"Hu_6"),1,null),o("a",null,{target:"_blank",href:"https://github.com/qwikifiers/qwik-ui","aria-label":"Qwik-UI GitHub repository",class:c(b({size:"icon",look:"ghost"}))},s(I,null,3,"Hu_7"),1,null),s(w,null,3,"Hu_8"),s(x,{type:"button","aria-label":"Toggle navigation",onClick$:l(()=>n(()=>Promise.resolve().then(()=>B),void 0),"s_0maQGnp079g",[i]),size:"icon",look:"ghost",class:"flex lg:hidden",children:s(j,{class:"h-6 w-6",[e]:{class:e}},3,"Hu_9"),[e]:{type:e,"aria-label":e,onClick$:e,size:e,look:e,class:e}},1,"Hu_10")],1,null)],1,null)],1,null),s(E,{class:"sidebar-mobile rounded-base mr-0 ml-auto h-screen w-sm border-0 bg-background text-foreground shadow-md",children:[o("div",null,{class:"mb-2 pt-2 pb-4"},s(O,{get linksGroups(){return r.menuItemsGroups&&r.menuItemsGroups.length>0?r.menuItemsGroups:void 0},class:"max-w-80 overflow-auto bg-background",[e]:{linksGroups:_(a=>a.menuItemsGroups&&a.menuItemsGroups.length>0?a.menuItemsGroups:void 0,[r]),class:e}},3,"Hu_11"),1,null),o("button",null,{autoFocus:!0,class:"absolute top-[26px] right-6",onClick$:l(()=>n(()=>Promise.resolve().then(()=>U),void 0),"s_eiqSMtRht5U",[i])},s(M,{class:"h-8 w-8",[e]:{class:e}},3,"Hu_12"),1,null)],[e]:{class:e}},1,"Hu_13")],[e]:{"bind:show":e}},1,"Hu_14")},be=Object.freeze(Object.defineProperty({__proto__:null,s_ROecjTy07ss:Q},Symbol.toStringTag,{value:"Module"})),W=`
    .sidebar-mobile::backdrop {
      background: rgba(0,0,0,0.5);
    }
  
    .sidebar-mobile {
      animation: sidebarOpen 0.75s forwards cubic-bezier(0.6, 0.6, 0, 1);
    }
  
    .sidebar-mobile::backdrop {
      animation: sidebarFadeIn 0.75s forwards cubic-bezier(0.6, 0.6, 0, 1);
    }
  
    .sidebar-mobile.modal-closing {
      animation: sidebarClose 0.35s forwards cubic-bezier(0.6, 0.6, 0, 1);
    }
  
    .sidebar-mobile.modal-closing::backdrop {
      animation: sidebarFadeOut 0.35s forwards cubic-bezier(0.6, 0.6, 0, 1);
    }

    @keyframes sidebarOpen {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0%);
      }
    }
  
    @keyframes sidebarClose {
      from {
        opacity: 1;
        transform: translateX(0%);
      }
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }
  
    @keyframes sidebarFadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  
    @keyframes sidebarFadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
    `,X=Object.freeze(Object.defineProperty({__proto__:null,s_FVkLLDqgxdc:W},Symbol.toStringTag,{value:"Module"})),$=()=>{const[t]=u();t.value=!t.value},B=Object.freeze(Object.defineProperty({__proto__:null,s_0maQGnp079g:$},Symbol.toStringTag,{value:"Module"}));export{be as h,$ as s_0maQGnp079g,W as s_FVkLLDqgxdc,Q as s_ROecjTy07ss,C as s_eiqSMtRht5U,F as s_wp5ADZk9oYk};
