import{t as i,N as t,z as h,O as u,S as e,U as b,D as p}from"./q-CsvfasCP.js";import{u as v}from"./q-D_NppxYb.js";import{s as y}from"./q-BnEU7A_-.js";import{F as m}from"./q-BhbRZEaL.js";import{_ as o}from"./q-BKZ00VYc.js";const g=i(t(()=>o(()=>import("./q-LBg8V4YB.js"),[]),"s_wPhmV5VphCs")),f=i(t(()=>o(()=>import("./q-CJH1p3kj.js"),[]),"s_pAGHW5bCHoU")),_=i(t(()=>o(()=>import("./q-DV4UVRh4.js"),[]),"s_e5XnofH9czE")),A=i(t(()=>o(()=>import("./q-DzzPwlMh.js"),[]),"s_jC9KhvQjuhk")),k=i(t(()=>o(()=>import("./q-BAE7rJCf.js"),[]),"s_d70n4zHIZs0")),x=i(t(()=>o(()=>import("./q-CJhrcqIF.js"),[]),"s_67cHfdT8oPI")),w=i(t(()=>o(()=>import("./q-CxHCa8bp.js"),[]),"s_bLS79rOK1Rg")),C=i(t(()=>o(()=>import("./q-B2eNdKp8.js"),[]),"s_tfTKCRNxg5g")),T=i(t(()=>o(()=>import("./q-DZkueXv9.js"),[]),"s_08e6ZXP0PPg")),E=i(t(()=>o(()=>import("./q-DRZNZUPH.js"),[]),"s_gUl5Ax868d8")),D=i(t(()=>o(()=>import("./q-M98eSWW4.js"),[]),"s_wtAFJp050L4")),S=i(t(()=>o(()=>import("./q-LcLl32Pt.js"),[]),"s_c0o5MfV14ds")),I=i(t(()=>o(()=>import("./q-BYDt-Cdn.js"),[]),"s_7HmNETYc97E")),R=i(t(()=>o(()=>import("./q-CpQS0xux.js"),[]),"s_70OQnOszm8M")),P=i(t(()=>o(()=>import("./q-BmnoIAMo.js"),[]),"s_4v3zFvu0YkM")),H=[{text:"Accordion",id:"accordion",level:1},{text:"✨ Features",id:"-features",level:2},{text:"Building blocks",id:"building-blocks",level:2},{text:"🎨 Anatomy",id:"-anatomy",level:3},{text:"Why use a headless accordion?",id:"why-use-a-headless-accordion",level:2},{text:"Native disclosure pain points",id:"native-disclosure-pain-points",level:3},{text:"Component State",id:"component-state",level:2},{text:"Initial value",id:"initial-value",level:3},{text:"Reactive value",id:"reactive-value",level:3},{text:"Programmatic changes",id:"programmatic-changes",level:3},{text:"Handling selection changes",id:"handling-selection-changes",level:3},{text:"Multiple items",id:"multiple-items",level:3},{text:"Non-collapsible",id:"non-collapsible",level:3},{text:"Disabled items",id:"disabled-items",level:3},{text:"Disabled Component",id:"disabled-component",level:3},{text:"Advanced",id:"advanced",level:2},{text:"Height Animation",id:"height-animation",level:3},{text:"Why does padding or border break the animation?",id:"why-does-padding-or-border-break-the-animation",level:3},{text:"CSR",id:"csr",level:3},{text:"Dynamic",id:"dynamic",level:3},{text:"Example CSS",id:"example-css",level:2},{text:"Keyboard Interaction",id:"keyboard-interaction",level:2},{text:"API",id:"api",level:2},{text:"Accordion.Root",id:"accordionroot",level:3},{text:"Accordion.Item",id:"accordionitem",level:3}],W={title:"Qwik UI | Accordion",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},q={title:"Qwik UI | Accordion"},F=i(b(a=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...v(),...a.components},{APITable:c,AnatomyTable:l,KeyboardInteractionTable:s,StatusBanner:d}=n;return c||r("APITable"),l||r("AnatomyTable"),s||r("KeyboardInteractionTable"),d||r("StatusBanner"),e(p,{children:[e(d,{status:y.headless.Accordion}),`
`,e(n.h1,{id:"accordion",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#accordion",children:e(n.span,{class:"icon icon-link"})}),"Accordion"]}),`
`,e(n.p,{children:"A set of interactive sections that show or hide connected information."}),`
`,e(g,{}),`
`,e(n.h2,{id:"-features",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-features",children:e(n.span,{class:"icon icon-link"})}),"✨ Features"]}),`
`,e(m,{features:["Follows the WAI-Aria design pattern","Full keyboard navigation","Can open one or multiple items at a time","Supports initial and reactive values"]}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(I,{}),`
`,e(n.h3,{id:"-anatomy",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-anatomy",children:e(n.span,{class:"icon icon-link"})}),"🎨 Anatomy"]}),`
`,e(l,{propDescriptors:[{name:"Accordion.Root",description:"The primary container for the accordion."},{name:"Accordion.Item",description:"A single disclosure widget."},{name:"Accordion.Header",description:"The heading element of an accordion item."},{name:"Accordion.Trigger",description:"Activates to show or hide the accordion content."},{name:"Accordion.Content",description:"Displays the content when its connected trigger is actived."}]}),`
`,e(n.h2,{id:"why-use-a-headless-accordion",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#why-use-a-headless-accordion",children:e(n.span,{class:"icon icon-link"})}),"Why use a headless accordion?"]}),`
`,e(n.p,{children:["While you can create a native disclosure with HTML elements like ",e(n.code,{children:"details"})," and ",e(n.code,{children:"summary"}),", there are some limitations and issues with them."]}),`
`,e(n.h3,{id:"native-disclosure-pain-points",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#native-disclosure-pain-points",children:e(n.span,{class:"icon icon-link"})}),"Native disclosure pain points"]}),`
`,e(m,{issues:["Cannot control multiple disclosures at once","Inconsistent accessible name computation","Unintuitive role announcements","Connected information is hard to find with AT"]}),`
`,e(n.p,{children:"Qwik UI includes a headless Accordion component that uses ARIA and JavaScript to enhance accessibility and usability for managing multiple sections smoothly."}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["For more information on the inconsistencies of these native elements, see Scott O'Hara's ",e(n.a,{href:"https://www.scottohara.me/blog/2022/09/12/details-summary.html",children:"The details and summary elements, again"})," article."]}),`
`]}),`
`,e(n.h2,{id:"component-state",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#component-state",children:e(n.span,{class:"icon icon-link"})}),"Component State"]}),`
`,e(n.h3,{id:"initial-value",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#initial-value",children:e(n.span,{class:"icon icon-link"})}),"Initial value"]}),`
`,e(n.p,{children:["To set a default or initial value on page load, use the ",e(n.code,{children:"value"})," prop on the ",e(n.code,{children:"<Accordion.Root />"})," component."]}),`
`,e(f,{}),`
`,e(n.p,{children:["The ",e(n.code,{children:"value"})," prop on the ",e(n.code,{children:"<Accordion.Root>"})," was set to ",e(n.code,{children:"item-2"}),", which is the value of the second item. As a result, the second item is selected by default."]}),`
`,e(n.h3,{id:"reactive-value",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#reactive-value",children:e(n.span,{class:"icon icon-link"})}),"Reactive value"]}),`
`,e(n.p,{children:["Pass reactive state by using the ",e(n.code,{children:"bind:value"})," prop on the ",e(n.code,{children:"<Accordion.Root /> "}),"component."]}),`
`,e(_,{}),`
`,e(n.h3,{id:"programmatic-changes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#programmatic-changes",children:e(n.span,{class:"icon icon-link"})}),"Programmatic changes"]}),`
`,e(n.p,{children:"You can also change the current expanded item values programmatically by updating the signal's value."}),`
`,e(A,{}),`
`,e(n.h3,{id:"handling-selection-changes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#handling-selection-changes",children:e(n.span,{class:"icon icon-link"})}),"Handling selection changes"]}),`
`,e(n.p,{children:["Listen to when a new item is selected by passing a callback function to the ",e(n.code,{children:"onChange$"})," prop."]}),`
`,e(k,{}),`
`,e(n.h3,{id:"multiple-items",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#multiple-items",children:e(n.span,{class:"icon icon-link"})}),"Multiple items"]}),`
`,e(n.p,{children:["To allow multiple items to be open at the same time, set the ",e(n.code,{children:"multiple"})," prop to ",e(n.code,{children:"true"}),"."]}),`
`,e(x,{}),`
`,e(n.h3,{id:"non-collapsible",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#non-collapsible",children:e(n.span,{class:"icon icon-link"})}),"Non-collapsible"]}),`
`,e(n.p,{children:["To disable collapsible behavior, set the ",e(n.code,{children:"collapsible"})," prop to ",e(n.code,{children:"false"}),"."]}),`
`,e(w,{}),`
`,e(n.p,{children:"This will prevent the accordion from collapsing when the user clicks on the trigger."}),`
`,e(n.h3,{id:"disabled-items",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#disabled-items",children:e(n.span,{class:"icon icon-link"})}),"Disabled items"]}),`
`,e(n.p,{children:["Items can be disabled by setting the ",e(n.code,{children:"disabled"})," prop to true on the ",e(n.code,{children:"<Accordion.Item />"})," component."]}),`
`,e(C,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Disabled items are not selectable or focusable. They are also skipped when using the arrow keys to navigate through the items."}),`
`]}),`
`,e(n.h3,{id:"disabled-component",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#disabled-component",children:e(n.span,{class:"icon icon-link"})}),"Disabled Component"]}),`
`,e(n.p,{children:["The component itself can also be disabled by setting the ",e(n.code,{children:"disabled"})," prop to true on the ",e(n.code,{children:"<Accordion.Root />"})," component."]}),`
`,e(T,{}),`
`,e(n.h2,{id:"advanced",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#advanced",children:e(n.span,{class:"icon icon-link"})}),"Advanced"]}),`
`,e(n.h3,{id:"height-animation",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#height-animation",children:e(n.span,{class:"icon icon-link"})}),"Height Animation"]}),`
`,e(n.p,{children:["To animate the Accordion content, the ",e(n.code,{children:"--qwikui-collapsible-content-height"})," CSS variable in your keyframes."]}),`
`,e(E,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["In the near future, you won't need JavaScript at all to animate the height of content! Here's the ",e(n.a,{href:"https://github.com/w3c/csswg-drafts/blob/main/css-values-5/calc-size-explainer.md",children:"CSS WG Proposal"})," for more info."]}),`
`]}),`
`,e(R,{}),`
`,e(n.h3,{id:"why-does-padding-or-border-break-the-animation",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#why-does-padding-or-border-break-the-animation",children:e(n.span,{class:"icon icon-link"})}),"Why does padding or border break the animation?"]}),`
`,e(n.p,{children:["Padding or border applied to ",e(n.code,{children:"Accordion.Content"})," breaks our keyframe animation above. This is because the content height has changed."]}),`
`,e(n.p,{children:"To fix this, add a child element to the content, and set the padding or border on that element."}),`
`,e(p,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Accordion.Content class="collapsible-animation collapsible-content">
  <p class="collapsible-content-outline">Content</p>
</Accordion.Content>`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"<"}),e(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Content"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"collapsible-animation collapsible-content"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"  <"}),e(n.span,{style:{color:"#5DE4C7"},children:"p"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"collapsible-content-outline"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">Content</"}),e(n.span,{style:{color:"#5DE4C7"},children:"p"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"</"}),e(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Content"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Rather than dealing with this under the hood, we thought it'd be appropriate to keep style management as simple as possible. Let us know if you have a better solution!"}),`
`]}),`
`,e(n.h3,{id:"csr",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#csr",children:e(n.span,{class:"icon icon-link"})}),"CSR"]}),`
`,e(n.p,{children:"The Accordion automatically renders based on its environment. This means that it works for both server-side and client-side rendering."}),`
`,e(D,{}),`
`,e(n.h3,{id:"dynamic",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#dynamic",children:e(n.span,{class:"icon icon-link"})}),"Dynamic"]}),`
`,e(n.p,{children:"You have custom control over how to render items in the Accordion, allowing for dynamic rendering of items."}),`
`,e(S,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"This also updates the selected items, disabled items, and focus order automatically for you."}),`
`]}),`
`,e(n.h2,{id:"example-css",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#example-css",children:e(n.span,{class:"icon icon-link"})}),"Example CSS"]}),`
`,e(P,{}),`
`,e(n.h2,{id:"keyboard-interaction",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#keyboard-interaction",children:e(n.span,{class:"icon icon-link"})}),"Keyboard Interaction"]}),`
`,e(s,{keyDescriptors:[{keyTitle:"Space",description:"Expands the content of the focused section."},{keyTitle:"Enter",description:"Expands the content of the focused section."},{keyTitle:"Tab",description:"Moves focus to the next element."},{keyTitle:"Shift + Tab",description:"Moves focus to the previous element."},{keyTitle:"ArrowDown",description:"Moves focus to the next trigger."},{keyTitle:"ArrowUp",description:"Moves focus to the previous trigger."},{keyTitle:"Home",description:"Moves focus to the first trigger."},{keyTitle:"End",description:"Moves focus to the last trigger."}]}),`
`,e(n.h2,{id:"api",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#api",children:e(n.span,{class:"icon icon-link"})}),"API"]}),`
`,e(n.h3,{id:"accordionroot",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#accordionroot",children:e(n.span,{class:"icon icon-link"})}),"Accordion.Root"]}),`
`,e(c,{propDescriptors:[{name:"value",type:"string",description:"The initial selectedd item of the accordion."},{name:"bind:value",type:"Signal",description:"Reactive signal that controls the selected item."},{name:"onChange$",type:"function",description:"Called when the state changes."},{name:"disabled",type:"boolean",description:"Disables the entire accordion."},{name:"collapsible",type:"boolean",description:"Allows items to be collapsible."},{name:"multiple",type:"boolean",description:"Allows multiple items to be expanded."}]}),`
`,e(n.h3,{id:"accordionitem",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#accordionitem",children:e(n.span,{class:"icon icon-link"})}),"Accordion.Item"]}),`
`,e(c,{propDescriptors:[{name:"value",type:"string",description:"The value associated with the accordion item."},{name:"disabled",type:"boolean",description:"When true, the accordion item is disabled."},{name:"open",type:"boolean",description:"Opens the accordion item in multiple mode."}]})]})},"_createMdxContent_0",[]));function r(a,n,c){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/accordion/index.mdx: Expected component `"+a+"` to be defined: you likely forgot to import, pass, or provide it.")}const U=(a={})=>{const n=h(u,{children:h(F,a,3,null)},3,"tlo_AaWr");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{U as default,q as frontmatter,W as head,H as headings};
