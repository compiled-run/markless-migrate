import{t as i,N as t,z as d,O as u,S as e,U as g,D as h}from"./q-CsvfasCP.js";import{u as f}from"./q-D_NppxYb.js";import{s as v}from"./q-BnEU7A_-.js";import{F as p}from"./q-BhbRZEaL.js";import{A as b}from"./q-O0gNLzeq.js";import{_ as o}from"./q-BKZ00VYc.js";const y=i(t(()=>o(()=>import("./q-DKMtiVGg.js"),[]),"s_IneWYzw9Z7A")),C=i(t(()=>o(()=>import("./q--7YSbui4.js"),[]),"s_bTf8M5td9Ac")),w=i(t(()=>o(()=>import("./q-B2RNtqsG.js"),[]),"s_wqliEHZ3vLw")),_=i(t(()=>o(()=>import("./q-NIrywfk0.js"),[]),"s_5BFvGtgGkw4")),x=i(t(()=>o(()=>import("./q-CU4QxJDp.js"),[]),"s_CaEJbZdphGE")),k=i(t(()=>o(()=>import("./q-BJ1DETba.js"),[]),"s_k8QK0ml3ZZI")),m=i(t(()=>o(()=>import("./q-BF_kci4x.js"),[]),"s_PdpcOJ5K9Ig")),A=i(t(()=>o(()=>import("./q-DHqQvS0X.js"),[]),"s_siBz16erKmA")),E=i(t(()=>o(()=>import("./q-BfyOSri9.js"),[]),"s_nzz7UeZ5aqw")),D=i(t(()=>o(()=>import("./q-hKBgJI7m.js"),[]),"s_8XKKklc081M")),S=i(t(()=>o(()=>import("./q-DaCsXcO2.js"),[]),"s_MPkGOuiVYiA")),O=[{text:"Collapsible",id:"collapsible",level:1},{text:"✨ Features",id:"-features",level:2},{text:"Building blocks",id:"building-blocks",level:2},{text:"🎨 Anatomy",id:"-anatomy",level:3},{text:"Why use a headless collapsible?",id:"why-use-a-headless-collapsible",level:2},{text:"Native element pain points",id:"native-element-pain-points",level:3},{text:"Component State",id:"component-state",level:2},{text:"Uncontrolled / Initial value",id:"uncontrolled--initial-value",level:3},{text:"Controlled / Reactive value",id:"controlled--reactive-value",level:3},{text:"Programmatic changes",id:"programmatic-changes",level:3},{text:"Handling open / close",id:"handling-open--close",level:3},{text:"Disabled collapsible",id:"disabled-collapsible",level:3},{text:"Animating the content",id:"animating-the-content",level:2},{text:"Height Animation",id:"height-animation",level:3},{text:"Why does padding or border break the animation?",id:"why-does-padding-or-border-break-the-animation",level:3},{text:"CSR",id:"csr",level:2},{text:"Example CSS",id:"example-css",level:2},{text:"Keyboard Interaction",id:"keyboard-interaction",level:2},{text:"API",id:"api",level:2},{text:"Data Attributes",id:"data-attributes",level:3},{text:"Collapsible.Root",id:"collapsibleroot",level:3}],M=void 0,T=i(g(a=>{const n={a:"a",blockquote:"blockquote",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...f(),...a.components},{APITable:l,KeyboardInteractionTable:r,StatusBanner:c}=n;return l||s("APITable"),r||s("KeyboardInteractionTable"),c||s("StatusBanner"),e(h,{children:[e(c,{status:v.headless.Collapsible}),`
`,e(n.h1,{id:"collapsible",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#collapsible",children:e(n.span,{class:"icon icon-link"})}),"Collapsible"]}),`
`,e(n.p,{children:"An interactive section that shows or hides its connected information."}),`
`,e(y,{}),`
`,e(n.h2,{id:"-features",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-features",children:e(n.span,{class:"icon icon-link"})}),"✨ Features"]}),`
`,e(p,{features:["Accessible as a button that shows content, following web a11y standards.","Full keyboard navigation","Controlled or uncontrolled","Initial open state does not wake up the component","Automatic entry/exit animation detection","Executes on interaction or programmatically"]}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(E,{}),`
`,e(n.h3,{id:"-anatomy",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-anatomy",children:e(n.span,{class:"icon icon-link"})}),"🎨 Anatomy"]}),`
`,e(b,{propDescriptors:[{name:"Collapsible.Root",description:"The root container for the Collapsible component."},{name:"Collapsible.Trigger",description:"A button that opens the Collapsible content when interacted with."},{name:"Collapsible.Content",description:"Contains the content associated with a Collapsible."}]}),`
`,e(n.h2,{id:"why-use-a-headless-collapsible",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#why-use-a-headless-collapsible",children:e(n.span,{class:"icon icon-link"})}),"Why use a headless collapsible?"]}),`
`,e(n.p,{children:["One of the most common questions: ",e(n.em,{children:['"why not use the native ',e(n.code,{children:"details"})," and ",e(n.code,{children:"summary"}),' HTML elements?"']}),"."]}),`
`,e(n.p,{children:"As much as we love the native elements, they come with a couple of problems:"}),`
`,e(n.h3,{id:"native-element-pain-points",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#native-element-pain-points",children:e(n.span,{class:"icon icon-link"})}),"Native element pain points"]}),`
`,e(p,{issues:["Inconsistent accessibility and browser support","Inconsistent screen reader support","Hierarchy and DOM structure restrictions","Lack of full programmatic control"]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["To read more about the reasons for implementing an ARIA disclosure widget, check out ",e(n.a,{href:"https://www.scottohara.me/blog/2022/09/12/details-summary.html",children:"Scott O'Hara's article"}),", as well as the ",e(n.a,{href:"https://html.spec.whatwg.org/multipage/interactive-elements.html#interactive-elements",children:"interactive elements"})," section of the HTML spec."]}),`
`]}),`
`,e(n.h2,{id:"component-state",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#component-state",children:e(n.span,{class:"icon icon-link"})}),"Component State"]}),`
`,e(n.h3,{id:"uncontrolled--initial-value",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#uncontrolled--initial-value",children:e(n.span,{class:"icon icon-link"})}),"Uncontrolled / Initial value"]}),`
`,e(n.p,{children:["We can select an initial uncontrolled value by passing the ",e(n.code,{children:"open"})," prop to the ",e(n.code,{children:"<Collapsible.Root />"})," component."]}),`
`,e(C,{}),`
`,e(n.p,{children:"The above example expands the collapsible by default. Something to notice, is there isn't any layout shift when refreshing the page."}),`
`,e(n.p,{children:["This is because the content is rendered on the server. Animations applied to ",e(n.code,{children:"data-open"})," take effect after the initial render to prevent layout shift."]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Thanks to Qwik's JavaScript Streaming behavior, we can have open state components without even resuming them!"}),`
`]}),`
`,e(n.h3,{id:"controlled--reactive-value",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#controlled--reactive-value",children:e(n.span,{class:"icon icon-link"})}),"Controlled / Reactive value"]}),`
`,e(n.p,{children:["We can pass reactive state by using the bind:open prop to the ",e(n.code,{children:"<Collapsible.Root />"})," component."]}),`
`,e(w,{}),`
`,e(n.p,{children:"bind:open is a signal prop, and allows us to pass in our own signal to control the expanded state of the collapsible."}),`
`,e(n.h3,{id:"programmatic-changes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#programmatic-changes",children:e(n.span,{class:"icon icon-link"})}),"Programmatic changes"]}),`
`,e(n.p,{children:"Now that we have a controlled state, we can programmatically change the state of the collapsible by changing the value of the signal."}),`
`,e(_,{}),`
`,e(n.p,{children:["The example above toggles the expanded state of the collapsible by changing the value of the ",e(n.code,{children:"isOpen"})," signal when the checkbox is clicked."]}),`
`,e(n.h3,{id:"handling-open--close",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#handling-open--close",children:e(n.span,{class:"icon icon-link"})}),"Handling open / close"]}),`
`,e(n.p,{children:"We may want to handle the open / close of the collapsible. For example, we may want execute some code when the collapsible is opened or closed."}),`
`,e(x,{}),`
`,e(n.p,{children:["To do that, we can use the ",e(n.code,{children:"onChange$"})," prop. A parameter is passed to the handler, which is a boolean indicating whether the collapsible is open or closed."]}),`
`,e(n.h3,{id:"disabled-collapsible",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#disabled-collapsible",children:e(n.span,{class:"icon icon-link"})}),"Disabled collapsible"]}),`
`,e(k,{}),`
`,e(n.p,{children:["The collapsible can be disabled by adding the ",e(n.code,{children:"disabled"})," prop to the ",e(n.code,{children:"<Collapsible.Root />"})," component."]}),`
`,e(n.h2,{id:"animating-the-content",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#animating-the-content",children:e(n.span,{class:"icon icon-link"})}),"Animating the content"]}),`
`,e(n.p,{children:"To animate the height of the content, we can use a keyframe animation on the height property."}),`
`,e(m,{}),`
`,e(n.h3,{id:"height-animation",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#height-animation",children:e(n.span,{class:"icon icon-link"})}),"Height Animation"]}),`
`,e(n.p,{children:["To animate the Accordion content, the ",e(n.code,{children:"--qwikui-collapsible-content-height"})," CSS variable in your keyframes."]}),`
`,e(m,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["In the near future, you won't need JavaScript at all to animate the height of content! Here's the ",e(n.a,{href:"https://github.com/w3c/csswg-drafts/blob/main/css-values-5/calc-size-explainer.md",children:"CSS WG Proposal"})," for more info."]}),`
`]}),`
`,e(D,{}),`
`,e(n.h3,{id:"why-does-padding-or-border-break-the-animation",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#why-does-padding-or-border-break-the-animation",children:e(n.span,{class:"icon icon-link"})}),"Why does padding or border break the animation?"]}),`
`,e(n.p,{children:["Padding or border applied to ",e(n.code,{children:"Collapsible.Content"})," breaks our keyframe animation above. This is because the content height has changed."]}),`
`,e(n.p,{children:"To fix this, add a child element to the content, and set the padding or border on that element."}),`
`,e(h,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Collapsible.Content class="collapsible-animation collapsible-content">
  <p class="collapsible-content-outline">Content</p>
</Collapsible.Content>`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"<"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Content"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"collapsible-animation collapsible-content"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"  <"}),e(n.span,{style:{color:"#5DE4C7"},children:"p"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"collapsible-content-outline"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">Content</"}),e(n.span,{style:{color:"#5DE4C7"},children:"p"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"</"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Content"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Rather than dealing with this under the hood, we thought it'd be appropriate to keep style management as simple as possible. Let us know if you have a better solution!"}),`
`]}),`
`,e(n.h2,{id:"csr",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#csr",children:e(n.span,{class:"icon icon-link"})}),"CSR"]}),`
`,e(n.p,{children:"The collapsible can be rendered both server-side or client-side, same with the rest of the components."}),`
`,e(A,{}),`
`,e(n.p,{children:"The main difference, is there is no server to client handoff. This can be useful if you're navigating via SPA."}),`
`,e(n.h2,{id:"example-css",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#example-css",children:e(n.span,{class:"icon icon-link"})}),"Example CSS"]}),`
`,e(S,{}),`
`,e(n.p,{children:"Every code example uses the following CSS:"}),`
`,e(n.p,{children:"Some CSS variables are specific to the docs, feel free to plug in your own values or variables!"}),`
`,e(n.h2,{id:"keyboard-interaction",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#keyboard-interaction",children:e(n.span,{class:"icon icon-link"})}),"Keyboard Interaction"]}),`
`,e(r,{keyDescriptors:[{keyTitle:"Space",description:"When focus is on the trigger, open or close the collapsible."},{keyTitle:"Enter",description:"When focus is on the trigger open or close the collapsible."}]}),`
`,e(n.h2,{id:"api",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#api",children:e(n.span,{class:"icon icon-link"})}),"API"]}),`
`,e(n.h3,{id:"data-attributes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#data-attributes",children:e(n.span,{class:"icon icon-link"})}),"Data Attributes"]}),`
`,e(n.p,{children:[e(n.code,{children:"Collapsible.Root"}),", ",e(n.code,{children:"Collapsible.Trigger"}),", and ",e(n.code,{children:"Collapsible.Content"})," all have the following data attributes that are used to track state:"]}),`
`,e(b,{firstColumnLabel:"Attribute",propDescriptors:[{name:"data-open",description:"If the collapsible is open (Boolean)."},{name:"data-closed",description:"If the collapsible is closed (Boolean)."},{name:"data-disabled",description:"If the collapsible is disabled (Boolean)."}]}),`
`,e(n.h3,{id:"collapsibleroot",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#collapsibleroot",children:e(n.span,{class:"icon icon-link"})}),"Collapsible.Root"]}),`
`,e(l,{propDescriptors:[{name:"open",type:"boolean",description:"Uncontrolled initial expanded value."},{name:"bind:open",type:"signal",description:"Controlled expanded value, manages the collapsible content.",info:"boolean"},{name:"onOpenChange$",type:"QRL",description:"Function called when the collapsible opens or closes.",info:"QRL<(open: boolean) => void>"},{name:"disabled",type:"boolean",description:"Disables the collapsible when true."}]})]})},"_createMdxContent_0",[]));function s(a,n,l){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/collapsible/index.mdx: Expected component `"+a+"` to be defined: you likely forgot to import, pass, or provide it.")}const V=(a={})=>{const n=d(u,{children:d(T,a,3,null)},3,"M_hNfyb7");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{V as default,M as frontmatter,O as headings};
