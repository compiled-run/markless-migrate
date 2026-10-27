import{_ as i}from"./q-BKZ00VYc.js";import{S as c}from"./q-tngcCgQi.js";import{f as d,z as r,k as t,c as o,D as s,N as l}from"./q-CsvfasCP.js";import{H as m}from"./q-BfDu4USj.js";import{H as b}from"./q-BlB4oLAe.js";import{a as g,H as u}from"./q-D_Au0Yj2.js";import{H as p}from"./q-584dNHyf.js";const w=()=>{const a=["Othello","The Hobbit","Dune","The Giver"];return d(l(()=>i(()=>Promise.resolve().then(()=>h),void 0),"s_q5tUxe0yJs4")),r(s,{children:[t("h2",null,{class:"tom-headline"},"Tom's bookshelf",3,null),r(m,{class:"accordion-root",children:a.map((n,e)=>r(b,{class:"accordion-item",children:[r(g,{as:"h3",children:r(u,{class:`accordion-trigger group ${e===0?"rounded-t-sm":""} ${e===a.length-1?"rounded-b-sm border-b-0":""}`,children:[t("span",null,null,["favorite book ",e+1],1,null),t("span",null,{style:{paddingLeft:"8px"}},r(c,null,3,"Fa_0"),1,null)]},1,"Fa_1"),[o]:{as:o}},1,"Fa_2"),r(p,{class:"accordion-slide accordion-content",children:t("p",null,null,n,1,null),[o]:{class:o}},1,"Fa_3")],[o]:{class:o}},1,e)),[o]:{class:o}},1,"Fa_4")]},1,"Fa_5")},f=`
    .accordion-root {
        box-sizing: border-box;
        border-radius: 0.275rem;
        color: #ffffff;
        width: 250px;
        max-width: 500px;
        border: 1px solid #4B5563;
        background-color: #4B5563;
    }

    .accordion-trigger {
        display: flex;
        min-height: 44px;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        text-align: left;
        border-bottom: 1px solid #374151;
        background-color: #4B5563;
        transition: background-color 200ms ease;
    }

    .accordion-trigger:hover {
        background-color: #374151;
      }

      .accordion-trigger.rounded-t-sm {
        border-top-left-radius: 0.125rem;
        border-top-right-radius: 0.125rem;
      }

      .accordion-trigger.rounded-b-sm {
        border-bottom-left-radius: 0.125rem;
        border-bottom-right-radius: 0.125rem;
      }

      .accordion-trigger.border-b-0 {
        border-bottom: 0;
      }

      .accordion-trigger[aria-expanded="true"] {
        border-radius: 0;
      }

      .accordion-trigger svg {
        transition: transform 500ms ease;
      }

      .accordion-trigger[aria-expanded="true"] svg {
        transform: rotateX(180deg);
      }

      .accordion-content {
        overflow: hidden;
        background-color: #1F2937;
      }

      .accordion-slide[data-open] {
        animation: 500ms cubic-bezier(0.87, 0, 0.13, 1) 0s 1 normal forwards accordion-open;
      }

      .accordion-slide[data-closed] {
        animation: 500ms cubic-bezier(0.87, 0, 0.13, 1) 0s 1 normal forwards accordion-close;
      }

      .accordion-content p {
        background: #1F2937;
        padding: 0.5rem 1rem;
      }

      .accordion-item:last-of-type .accordion-content {
        border-bottom-left-radius: 0.275rem;
        border-bottom-right-radius: 0.275rem;
      }

      .tom-headline {
        margin-bottom: 16px;
        font-weight: 600;
      }
  `,h=Object.freeze(Object.defineProperty({__proto__:null,s_q5tUxe0yJs4:f},Symbol.toStringTag,{value:"Module"}));export{w as s_bFs96SL30hg,f as s_q5tUxe0yJs4};
