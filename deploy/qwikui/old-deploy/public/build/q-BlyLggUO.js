import{t as i,N as r,z as p,O as u,S as e,U as m,D as g}from"./q-CsvfasCP.js";import{u as b}from"./q-D_NppxYb.js";import{s as f}from"./q-BnEU7A_-.js";import{_ as t}from"./q-BKZ00VYc.js";const a=i(r(()=>t(()=>import("./q-DGZX00Eb.js"),[]),"s_NxdjweP0Dco")),x=i(r(()=>t(()=>import("./q-28pXhXB1.js"),[]),"s_l9J2yuizSr8")),_=i(r(()=>t(()=>import("./q-T-jVTg65.js"),[]),"s_dEe7vkcDdk0")),v=i(r(()=>t(()=>import("./q-BZ_6zNtW.js"),[]),"s_cfnnJ6YFcGA")),k=i(r(()=>t(()=>import("./q-DcjrXOnX.js"),[]),"s_rHWJLtzp8dQ")),y=i(r(()=>t(()=>import("./q-TtBRV2mB.js"),[]),"s_eY8qHtCdv9k")),I=i(r(()=>t(()=>import("./q-D_phiVRP.js"),[]),"s_oyZaVf2BLLY")),P=i(r(()=>t(()=>import("./q-qfwgtCcG.js"),[]),"s_G6V6SOT0oYA")),S=i(r(()=>t(()=>import("./q-BaJzdUdj.js"),[]),"s_bA8nDk9bvRU")),w=i(r(()=>t(()=>import("./q-DcZfi4l7.js"),[]),"s_Tela5Exy03Q")),R=[{text:"Progress",id:"progress",level:1},{text:"✨ Features",id:"-features",level:2},{text:"Defining the range",id:"defining-the-range",level:2},{text:"Min",id:"min",level:3},{text:"Adding a value",id:"adding-a-value",level:3},{text:"Max",id:"max",level:3},{text:"Status",id:"status",level:2},{text:"In progress",id:"in-progress",level:3},{text:"Complete",id:"complete",level:3},{text:"Indeterminate progress",id:"indeterminate-progress",level:3},{text:"Indeterminate Example CSS",id:"indeterminate-example-css",level:4},{text:"State",id:"state",level:2},{text:"Initial Progress",id:"initial-progress",level:3},{text:"Dynamic Progress Updates",id:"dynamic-progress-updates",level:3},{text:"CSR",id:"csr",level:2},{text:"Building blocks",id:"building-blocks",level:2},{text:"🎨 Anatomy",id:"-anatomy",level:3},{text:"Example CSS",id:"example-css",level:2},{text:"API",id:"api",level:2},{text:"Progress.Root",id:"progressroot",level:3}],L={title:"Qwik UI | Progress",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},M={title:"Qwik UI | Progress"},A=i(m(s=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",p:"p",span:"span",...b(),...s.components},{APITable:d,AnatomyTable:l,FeatureList:c,StatusBanner:h}=n;return d||o("APITable"),l||o("AnatomyTable"),c||o("FeatureList"),h||o("StatusBanner"),e(g,{children:[e(h,{status:f.headless.Progress}),`
`,e(n.h1,{id:"progress",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#progress",children:e(n.span,{class:"icon icon-link"})}),"Progress"]}),`
`,e(n.p,{children:"Displays an indicator showing the completion progress of a task, typically displayed as a progress bar."}),`
`,e(a,{}),`
`,e(n.h2,{id:"-features",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-features",children:e(n.span,{class:"icon icon-link"})}),"✨ Features"]}),`
`,e(c,{features:["Follows the WAI-Aria design pattern","Supports indeterminate state for unknown progress","Allows dynamic updatess","Customizable value labels for accessibility"]}),`
`,e(n.h2,{id:"defining-the-range",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#defining-the-range",children:e(n.span,{class:"icon icon-link"})}),"Defining the range"]}),`
`,e(n.h3,{id:"min",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#min",children:e(n.span,{class:"icon icon-link"})}),"Min"]}),`
`,e(n.p,{children:["The ",e(n.code,{children:"min"})," prop sets a minimum starting point for the progress bar."]}),`
`,e(x,{}),`
`,e(n.h3,{id:"adding-a-value",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#adding-a-value",children:e(n.span,{class:"icon icon-link"})}),"Adding a value"]}),`
`,e(n.p,{children:["To set a value for the progress bar, use the ",e(n.code,{children:"value"})," prop in the ",e(n.code,{children:"Progress.Root"})," component."]}),`
`,e(a,{}),`
`,e(n.h3,{id:"max",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#max",children:e(n.span,{class:"icon icon-link"})}),"Max"]}),`
`,e(n.p,{children:["The ",e(n.code,{children:"max"})," prop defines the upper limit of the progress bar."]}),`
`,e(_,{}),`
`,e(n.h2,{id:"status",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#status",children:e(n.span,{class:"icon icon-link"})}),"Status"]}),`
`,e(n.h3,{id:"in-progress",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#in-progress",children:e(n.span,{class:"icon icon-link"})}),"In progress"]}),`
`,e(n.p,{children:"When the task is ongoing, the progress component reflects this state."}),`
`,e(a,{}),`
`,e(n.p,{children:["The ",e(n.code,{children:'data-progress="in-progress"'})," attribute is applied to the progress and its indicator."]}),`
`,e(n.h3,{id:"complete",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#complete",children:e(n.span,{class:"icon icon-link"})}),"Complete"]}),`
`,e(n.p,{children:["When the task is finished, the ",e(n.code,{children:'data-progress="complete"'})," attribute is applied."]}),`
`,e(v,{}),`
`,e(n.h3,{id:"indeterminate-progress",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#indeterminate-progress",children:e(n.span,{class:"icon icon-link"})}),"Indeterminate progress"]}),`
`,e(n.p,{children:["If the progress is uncertain, the bar should be in an indeterminate state. This occurs when the value is ",e(n.code,{children:"null"}),"."]}),`
`,e(k,{}),`
`,e(n.p,{children:["In this state, the progress and its indicator will have the ",e(n.code,{children:'data-progress="indeterminate"'})," attribute."]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Indeterminate progress is ideal for indicating ongoing operations without a clear completion time."}),`
`]}),`
`,e(n.h4,{id:"indeterminate-example-css",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#indeterminate-example-css",children:e(n.span,{class:"icon icon-link"})}),"Indeterminate Example CSS"]}),`
`,e(S,{}),`
`,e(n.h2,{id:"state",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#state",children:e(n.span,{class:"icon icon-link"})}),"State"]}),`
`,e(n.h3,{id:"initial-progress",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#initial-progress",children:e(n.span,{class:"icon icon-link"})}),"Initial Progress"]}),`
`,e(n.p,{children:["To set the initial progress on page load, you can pass a ",e(n.code,{children:"value"})," prop to the ",e(n.code,{children:"Progress.Root"})," component."]}),`
`,e(a,{}),`
`,e(n.h3,{id:"dynamic-progress-updates",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#dynamic-progress-updates",children:e(n.span,{class:"icon icon-link"})}),"Dynamic Progress Updates"]}),`
`,e(n.p,{children:["To update the progress bar in real-time, pass a signal to the ",e(n.code,{children:"bind:value"})," prop."]}),`
`,e(y,{}),`
`,e(n.p,{children:["The progress bar can also be used in combination with other Qwik UI headless components, such as the Carousel component when the user ",e(n.a,{href:"../carousel/#progress",children:"navigates through the slides"}),"."]}),`
`,e(n.h2,{id:"csr",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#csr",children:e(n.span,{class:"icon icon-link"})}),"CSR"]}),`
`,e(n.p,{children:"Similar to other Qwik UI headless components, the Progress Bar automatically renders based on its environment. The previous progress bars are rendered on the server."}),`
`,e(I,{}),`
`,e(n.p,{children:["The example above shows the progress bar being rendered on the client when the ",e(n.code,{children:"isRendered"})," signal is set to ",e(n.code,{children:"true"}),"."]}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(P,{}),`
`,e(n.h3,{id:"-anatomy",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-anatomy",children:e(n.span,{class:"icon icon-link"})}),"🎨 Anatomy"]}),`
`,e(l,{propDescriptors:[{name:"Progress.Root",description:"The root container for the progress"},{name:"Progress.Indicator",description:"Displays the progression process"}]}),`
`,e(n.h2,{id:"example-css",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#example-css",children:e(n.span,{class:"icon icon-link"})}),"Example CSS"]}),`
`,e(w,{}),`
`,e(n.h2,{id:"api",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#api",children:e(n.span,{class:"icon icon-link"})}),"API"]}),`
`,e(n.h3,{id:"progressroot",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#progressroot",children:e(n.span,{class:"icon icon-link"})}),"Progress.Root"]}),`
`,e(d,{propDescriptors:[{name:"value",type:"union",info:"number | null",description:"Current value of the progress bar. Can be null for indeterminate state."},{name:"min",type:"number",description:"Minimum starting point for the progress bar."},{name:"max",type:"number",description:"Maximum value of the progress bar."},{name:"getValueLabel",type:"function",description:"A function to get the accessible label for the current value. If not provided, the label will be shown as a percentage of the range."},{name:"bind:value",type:"Signal",info:"Signal<number | null>",description:"A signal to bind the current value of the progress bar for reactive updates."}]})]})},"_createMdxContent_0",[]));function o(s,n,d){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/progress/index.mdx: Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}const V=(s={})=>{const n=p(u,{children:p(A,s,3,null)},3,"NxphebKp");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{V as default,M as frontmatter,L as head,R as headings};
