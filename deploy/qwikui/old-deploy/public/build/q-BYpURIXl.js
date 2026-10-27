import{t as o,N as i,z as m,O as g,S as e,U as y,D as c}from"./q-CsvfasCP.js";import{u as f}from"./q-D_NppxYb.js";import{s as b}from"./q-BnEU7A_-.js";import{_ as t}from"./q-BKZ00VYc.js";const w=o(i(()=>t(()=>import("./q-uNXLKDzk.js").then(r=>r.s),[]),"s_vCANVGn4h0M")),A=o(i(()=>t(()=>import("./q-DnTwY7MD.js"),[]),"s_0rrS0gNOqT8")),_=o(i(()=>t(()=>import("./q-uPtDkrNc.js"),[]),"s_Ugq4TxmWBRE")),x=o(i(()=>t(()=>import("./q-7Toa4pPx.js"),[]),"s_L0yvib00ToE")),k=o(i(()=>t(()=>import("./q-BRKh7SM5.js"),[]),"s_zpoTRm9AH8k")),C=o(i(()=>t(()=>import("./q-B2ZWvtpR.js"),[]),"s_ycdCVcQ68L0")),P=o(i(()=>t(()=>import("./q-Cdoia515.js"),[]),"s_2430WI5BiRI")),D=o(i(()=>t(()=>import("./q-CRkd_-pH.js"),[]),"s_3gZqpgTmlRE")),E=o(i(()=>t(()=>import("./q-B2gk62eB.js"),[]),"s_gOU0x620IRo")),T=o(i(()=>t(()=>import("./q-CDyDpsXh.js"),[]),"s_nEITcRuzN0w")),I=o(i(()=>t(()=>import("./q-Y0kbuVvY.js"),[]),"s_f0iPrXUcdvA")),S=o(i(()=>t(()=>import("./q-B4iF7xl0.js"),[]),"s_qDW7a9p0WC8")),F=o(i(()=>t(()=>import("./q-Ecg91J8z.js"),[]),"s_brvHEa8wQ7I")),B=o(i(()=>t(()=>import("./q-ByAWvm_a.js"),[]),"s_y7dyzZI0Ndw")),L=o(i(()=>t(()=>import("./q-B9RmZsRY.js"),[]),"s_9dqUL7TBpP4")),R=o(i(()=>t(()=>import("./q-DmhoIhq8.js"),[]),"s_h0m5pYvLe5A")),O=o(i(()=>t(()=>import("./q-JQIPHQG2.js"),[]),"s_jmEgud3LI0Y")),U=o(i(()=>t(()=>import("./q-3AChRqnR.js"),[]),"s_gJVn8Qbf3gM")),z=[{text:"Popover",id:"popover",level:1},{text:"Building blocks",id:"building-blocks",level:2},{text:"🎨 Anatomy",id:"-anatomy",level:3},{text:"What is a Popover?",id:"what-is-a-popover",level:2},{text:"When would I use a popover?",id:"when-would-i-use-a-popover",level:3},{text:"Use case examples",id:"use-case-examples",level:2},{text:"Caveats",id:"caveats",level:2},{text:"Styling open popovers",id:"styling-open-popovers",level:3},{text:"Popover modes",id:"popover-modes",level:2},{text:"Auto",id:"auto",level:3},{text:"Manual",id:"manual",level:3},{text:"Programmatic Behavior",id:"programmatic-behavior",level:2},{text:"Handling state changes",id:"handling-state-changes",level:3},{text:"Floating Behavior",id:"floating-behavior",level:2},{text:"Opt out of the floating library",id:"opt-out-of-the-floating-library",level:3},{text:"Configuration",id:"configuration",level:2},{text:"Custom Floating Position",id:"custom-floating-position",level:3},{text:"Start & End",id:"start--end",level:4},{text:"Flip",id:"flip",level:3},{text:"Gutter",id:"gutter",level:3},{text:"Styling",id:"styling",level:2},{text:"Floating preset",id:"floating-preset",level:3},{text:"Animations",id:"animations",level:2},{text:"Keyframe Animation Example",id:"keyframe-animation-example",level:3},{text:"Transition declarations",id:"transition-declarations",level:3},{text:"Additional References",id:"additional-references",level:2},{text:"Popover Root",id:"popover-root",level:3},{text:"Popover Panel",id:"popover-panel",level:3},{text:"usePopover hook",id:"usepopover-hook",level:3}],N={title:"Qwik UI | Popover",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},H={title:"Qwik UI | Popover"},Q=o(y(r=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",li:"li",p:"p",pre:"pre",span:"span",strong:"strong",ul:"ul",...f(),...r.components},{APITable:l,AnatomyTable:s,BrowserAnimationsCompatability:d,FeatureList:p,Note:h,StatusBanner:u,TopLayerAnimationsCaveats:v}=n;return l||a("APITable"),s||a("AnatomyTable"),d||a("BrowserAnimationsCompatability"),p||a("FeatureList"),h||a("Note"),u||a("StatusBanner"),v||a("TopLayerAnimationsCaveats"),e(c,{children:[e(u,{status:b.headless.Popover}),`
`,e(n.h1,{id:"popover",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#popover",children:e(n.span,{class:"icon icon-link"})}),"Popover"]}),`
`,e(n.p,{children:"A popup that goes above other content on the page. You can still interact with the rest of the page while the popover is open."}),`
`,e(A,{}),`
`,e(p,{features:["In the Top Layer (above the rest of the page)","Built on top of the native popover API specification","Polyfill for unsupported browsers","Executes code on interaction","Float and position the popover","Supports RTL"]}),`
`,e(_,{}),`
`,e(n.p,{children:["The Qwik UI Popover component is built on top of the ",e(n.a,{href:"https://developer.mozilla.org/en-US/docs/Web/API/Popover_API",children:"Native Popover API"}),". Support is in every browser, and will increase over time."]}),`
`,e(n.p,{children:"While we wait for support though, Qwik UI uses a polyfill under the hood for you, so that you can use the component in all browsers."}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(O,{}),`
`,e(n.h3,{id:"-anatomy",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#-anatomy",children:e(n.span,{class:"icon icon-link"})}),"🎨 Anatomy"]}),`
`,e(s,{propDescriptors:[{name:"Popover.Root",description:"The parent container for the popover trigger and panel."},{name:"Popover.Trigger",description:"A button that opens the popover when interacted with."},{name:"Popover.Panel",description:"An HTML Element that is above other content on the page."}]}),`
`,e(n.h2,{id:"what-is-a-popover",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#what-is-a-popover",children:e(n.span,{class:"icon icon-link"})}),"What is a Popover?"]}),`
`,e(n.p,{children:["A popover is a ",e(n.strong,{children:"non-modal"})," UI element that creates overlays around a DOM element. Non-modal meaning the rest of the page can be interacted with while the popover is shown."]}),`
`,e(n.p,{children:"It's great for displaying additional information or options without navigating away from the current context."}),`
`,e(x,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["It is the web's native solution to ",e(n.a,{href:"https://qwik.builder.io/docs/cookbook/portal/#portal",children:"portals"}),", which are commonly used in other JavaScript frameworks."]}),`
`]}),`
`,e(n.h3,{id:"when-would-i-use-a-popover",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#when-would-i-use-a-popover",children:e(n.span,{class:"icon icon-link"})}),"When would I use a popover?"]}),`
`,e(n.p,{children:"It can help prevent overflow issues within your UI, and make sure your content is above everything. The popover component guarantees that your items in the panel remains above the rest of the page."}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"Many other Qwik UI headless components use the Qwik UI Popover."}),`
`]}),`
`,e(n.h2,{id:"use-case-examples",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#use-case-examples",children:e(n.span,{class:"icon icon-link"})}),"Use case examples"]}),`
`," ",`
`,e(s,{propDescriptors:[{name:"Combobox",description:"A text input that allows users to fill in values from a predefined list."},{name:"Select",description:"A dropdown menu that allows users to choose one value from a list."},{name:"Context Menu",description:"A menu that appears upon user interaction, such as right-clicking."},{name:"Tooltip",description:"A text label that appears when a user hovers, focuses, or touches an element."},{name:"Toast",description:"A small message that shows up temporarily to give the user some feedback."},{name:"Dropdown Menu",description:"A list of options that appears below a button, that users can select from."},{name:"Hover Card",description:"A card that appears when a user hovers over an element."}]}),`
`,e(n.h2,{id:"caveats",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#caveats",children:e(n.span,{class:"icon icon-link"})}),"Caveats"]}),`
`,e(h,{status:"warning",children:e(n.p,{children:"While we handle most of the hard stuff, there is some details that should be considered."})}),`
`,e(n.h3,{id:"styling-open-popovers",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#styling-open-popovers",children:e(n.span,{class:"icon icon-link"})}),"Styling open popovers"]}),`
`,e(c,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`.popover-panel[data-open] {
  background: green;
}`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"popover"}),e(n.span,{style:{color:"#91B4D5"},children:"-"}),e(n.span,{style:{color:"#E4F0FB"},children:"panel"}),e(n.span,{style:{color:"#A6ACCD"},children:"["}),e(n.span,{style:{color:"#E4F0FB"},children:"data"}),e(n.span,{style:{color:"#91B4D5"},children:"-"}),e(n.span,{style:{color:"#E4F0FB"},children:"open"}),e(n.span,{style:{color:"#A6ACCD"},children:"] {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  background"}),e(n.span,{style:{color:"#A6ACCD"},children:": "}),e(n.span,{style:{color:"#E4F0FB"},children:"green"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,e(n.p,{children:["Use the ",e(n.code,{children:"data-open"})," attribute on the ",e(n.code,{children:"<Popover.Panel>"})," component to specifically style the popup when it's open on all browsers."]}),`
`,e(n.h2,{id:"popover-modes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#popover-modes",children:e(n.span,{class:"icon icon-link"})}),"Popover modes"]}),`
`,e(n.h3,{id:"auto",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#auto",children:e(n.span,{class:"icon icon-link"})}),"Auto"]}),`
`,e(n.p,{children:"By default, a popover is auto."}),`
`,e(k,{}),`
`,e(n.p,{children:"An auto popover will automatically hide when you click outside of it and typically only one can be shown at a time."}),`
`,e(n.p,{children:"Auto popovers dismiss when clicking outside of them and pressing the escape key. There can also only be one auto popover open at a time."}),`
`,e(n.h3,{id:"manual",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#manual",children:e(n.span,{class:"icon icon-link"})}),"Manual"]}),`
`,e(n.p,{children:"A manual popover gives you more control over the popup."}),`
`,e(C,{}),`
`,e(n.p,{children:["Manual popovers do not dismiss unless you click on the ",e(n.code,{children:"<Popover.Trigger>"})," or programmatically close them."]}),`
`,e(n.h2,{id:"programmatic-behavior",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#programmatic-behavior",children:e(n.span,{class:"icon icon-link"})}),"Programmatic Behavior"]}),`
`,e(n.p,{children:["To programmatically open the ",e(n.code,{children:"Popover.Panel"}),", Qwik UI provides a couple functions from the ",e(n.code,{children:"usePopover"})," hook."]}),`
`,e(l,{propDescriptors:[{name:"showPopover()",type:"QRL",description:"Opens the popover."},{name:"hidePopover()",type:"QRL",description:"Closes the popover."},{name:"togglePopover()",type:"QRL",description:"Toggles the popover between the open and closed."}]}),`
`,e(P,{}),`
`,e(n.p,{children:["We can control where the popover is floating by using the ",e(n.code,{children:"bind:anchor"})," prop. We pass it a signal, and use that signal as the anchor's ",e(n.code,{children:"ref"}),"."]}),`
`,e(n.p,{children:["Then, make sure to add an ID to the ",e(n.code,{children:"<Popover.Root>"})," component. This ID must match the ID provided to ",e(n.code,{children:"usePopover"}),"."]}),`
`,e(c,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`// a more advanced use case
const { showPopover, hidePopover } = usePopover(popoverId);

useTask$(async ({ track }) => {
  track(() => context.isListboxOpenSig.value);

  if (isServer) return;

  if (context.isListboxOpenSig.value) {
    showPopover();
  } else {
    hidePopover();
  }
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:e(n.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"// a more advanced use case"})}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"const"}),e(n.span,{style:{color:"#A6ACCD"},children:" { "}),e(n.span,{style:{color:"#E4F0FB"},children:"showPopover"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#E4F0FB"},children:"hidePopover"}),e(n.span,{style:{color:"#A6ACCD"},children:" } "}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FBD0"},children:" usePopover"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#E4F0FB"},children:"popoverId"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"useTask$"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#5DE4C7"},children:"async"}),e(n.span,{style:{color:"#A6ACCD"},children:" ({ "}),e(n.span,{style:{color:"#E4F0FB"},children:"track"}),e(n.span,{style:{color:"#A6ACCD"},children:" }) "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"  track"}),e(n.span,{style:{color:"#A6ACCD"},children:"(() "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#E4F0FB"},children:" context"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"isListboxOpenSig"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"  if ("}),e(n.span,{style:{color:"#E4F0FB"},children:"isServer"}),e(n.span,{style:{color:"#A6ACCD"},children:") "}),e(n.span,{style:{color:"#5DE4C7C0"},children:"return"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"  if ("}),e(n.span,{style:{color:"#E4F0FB"},children:"context"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"isListboxOpenSig"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#A6ACCD"},children:") {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"    showPopover"}),e(n.span,{style:{color:"#A6ACCD"},children:"();"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  } else {"})}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"    hidePopover"}),e(n.span,{style:{color:"#A6ACCD"},children:"();"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.p,{children:"Above is an example of how we programmatically open and close the popover in the Qwik UI Select component."}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"In the native spec, these are methods, although we want to ensure code executes on interaction in all browsers, including the polyfill."}),`
`]}),`
`,e(n.h3,{id:"handling-state-changes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#handling-state-changes",children:e(n.span,{class:"icon icon-link"})}),"Handling state changes"]}),`
`,e(D,{}),`
`,e(n.p,{children:["Use the ",e(n.code,{children:"onToggle$"})," prop on the ",e(n.code,{children:"<Popover.Panel>"})," to listen for changes to the popover visibility."]}),`
`,e(n.p,{children:["The example above uses a ",e(n.code,{children:"Signal"})," to track whether the popover is triggered or not."]}),`
`,e(n.h2,{id:"floating-behavior",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#floating-behavior",children:e(n.span,{class:"icon icon-link"})}),"Floating Behavior"]}),`
`,e(n.p,{children:"By default, the Qwik UI Popover will float below the trigger component."}),`
`,e(E,{}),`
`,e(n.p,{children:"To make a popover float, we use JavaScript to choose where the popover should be positioned."}),`
`,e(n.p,{children:"Floating mode makes the bundle a bit bigger. We try to keep the API small but still powerful."}),`
`,e(n.h3,{id:"opt-out-of-the-floating-library",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#opt-out-of-the-floating-library",children:e(n.span,{class:"icon icon-link"})}),"Opt out of the floating library"]}),`
`,e(n.p,{children:["We can opt out of the floating library by setting ",e(n.code,{children:"floating={false}"})," on the ",e(n.code,{children:"<Popover.Root>"}),"."]}),`
`,e(n.p,{children:"Instead, the popover will be fixed position, and you can use CSS to position it."}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"When all browsers support the CSS anchor API, you can get floating behavior in pure CSS! Shaving off some size."}),`
`]}),`
`,e(n.h2,{id:"configuration",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#configuration",children:e(n.span,{class:"icon icon-link"})}),"Configuration"]}),`
`,e(n.p,{children:["The ",e(n.code,{children:"Popover.Root"})," component is designed for positioning elements that float and facilitating interactions with them."]}),`
`,e(n.h3,{id:"custom-floating-position",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#custom-floating-position",children:e(n.span,{class:"icon icon-link"})}),"Custom Floating Position"]}),`
`,e(n.p,{children:"By default, popovers will float below the trigger component."}),`
`,e(n.p,{children:["When setting ",e(n.code,{children:"floating"})," on the root, you can customize the position of the popover."]}),`
`,e(T,{}),`
`,e(n.p,{children:["Above we have set the ",e(n.code,{children:"floating"})," prop to ",e(n.code,{children:"right"}),", and so the ",e(n.code,{children:"<Popover.Panel>"})," will be positioned to the right of the trigger."]}),`
`,e(n.h4,{id:"start--end",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#start--end",children:e(n.span,{class:"icon icon-link"})}),"Start & End"]}),`
`,e(n.p,{children:"This also includes moving things to specific corners of the anchor."}),`
`,e(I,{}),`
`,e(n.p,{children:["You can suffix the direction with ",e(n.code,{children:"-start"})," or ",e(n.code,{children:"-end"})," to move the popover to the start or end of the anchor."]}),`
`,e(n.h3,{id:"flip",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#flip",children:e(n.span,{class:"icon icon-link"})}),"Flip"]}),`
`,e(n.p,{children:["Enabled by default, we can use the ",e(n.code,{children:"flip"})," prop to flip its position based on the available space in the viewport."]}),`
`,e(S,{}),`
`,e(n.p,{children:["To disable flipping, set ",e(n.code,{children:"flip={false}"})," on the ",e(n.code,{children:"<Popover.Root>"}),"."]}),`
`,e(n.h3,{id:"gutter",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#gutter",children:e(n.span,{class:"icon icon-link"})}),"Gutter"]}),`
`,e(n.p,{children:"In the previous docs examples, we use the gutter property on the listbox. Gutter is the space between the anchor element and the floating element."}),`
`,e(F,{}),`
`,e(n.h2,{id:"styling",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#styling",children:e(n.span,{class:"icon icon-link"})}),"Styling"]}),`
`,e(n.p,{children:["Styles can be added normally like any other component in Qwik UI, such as adding a class. The Popover API however, exposes the ",e(n.code,{children:"[popover]"})," attribute."]}),`
`,e(n.p,{children:["If Tailwind is the framework of choice, then styles can be added using the ",e(n.a,{href:"https://tailwindcss.com/docs/hover-focus-and-other-states#using-arbitrary-variants",children:"arbitrary variant syntax"})," or ",e(n.a,{href:"https://tailwindcss.com/docs/reusing-styles#extracting-classes-with-apply",children:"@apply"})," command. Below is an example of styling with ",e(n.code,{children:"[popover]"})," as an arbitrary variant."]}),`
`,e(B,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["The arbitrary variant can be customized/abstracted even further by ",e(n.a,{href:"https://tailwindcss.com/docs/plugins#adding-variants",children:"adding a variant"})," as a plugin in the tailwind config."]}),`
`]}),`
`,e(n.h3,{id:"floating-preset",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#floating-preset",children:e(n.span,{class:"icon icon-link"})}),"Floating preset"]}),`
`,e(n.p,{children:"By default, the popover API comes with built-in browser styles, including fixed behavior, margin, the list goes on."}),`
`,e(n.p,{children:"There are times when we want to override this behavior. An example being when we want floating behavior."}),`
`,e(n.p,{children:"Qwik UI strips the following styles when in floating mode:"}),`
`,e(U,{}),`
`,e(n.p,{children:["We put it under an ",e(n.code,{children:"@layer"})," so that it can be easily overridden when adding your own styles."]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:[e(n.code,{children:"data-floating"})," is a data attribute that gets added to the popover when you set the floating prop to true."]}),`
`]}),`
`,e(n.h2,{id:"animations",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#animations",children:e(n.span,{class:"icon icon-link"})}),"Animations"]}),`
`,e(n.p,{children:["Popovers present unique challenges for animations due to their reliance on the ",e(n.code,{children:"display"})," property, which traditionally hasn't been animatable. Modern browsers solve this problem with discrete animations, which allow smooth transitions between ",e(n.code,{children:"display: none"})," and ",e(n.code,{children:"display: block"}),". This ensures that popovers remain visible for the entire duration of the animation."]}),`
`,e(n.p,{children:"There are two main types of animations that can be applied to popovers in Qwik UI:"}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:[e(n.strong,{children:"Keyframe Animations"}),": For more complex entry and exit animations, such as growing or shrinking effects."]}),`
`,e(n.li,{children:[e(n.strong,{children:"CSS Transitions"}),": For smoother, incremental property changes like opacity and scaling."]}),`
`]}),`
`,e(n.p,{children:["To handle animations across all browsers, Qwik UI uses both keyframes and transitions, leveraging the native ",e(n.code,{children:":popover-open"})," pseudo-class and ensuring smooth state transitions with ",e(n.code,{children:"transition-behavior: allow-discrete"}),"."]}),`
`,e(d,{}),`
`,e(n.h3,{id:"keyframe-animation-example",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#keyframe-animation-example",children:e(n.span,{class:"icon icon-link"})}),"Keyframe Animation Example"]}),`
`,e(n.p,{children:["Keyframes are ideal for handling the entry and exit of the popover. Below is an example using ",e(n.code,{children:"popover-grow"})," for opening and ",e(n.code,{children:"popover-shrink"})," for closing the popover:"]}),`
`,e(L,{}),`
`,e(n.h3,{id:"transition-declarations",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#transition-declarations",children:e(n.span,{class:"icon icon-link"})}),"Transition declarations"]}),`
`,e(n.p,{children:"CSS transitions are useful for animating properties like opacity and scale over time. Discrete properties like display and overlay can be handled using transition-behavior: allow-discrete."}),`
`,e(R,{}),`
`,e(v,{}),`
`,e(n.p,{children:["By using keyframe animations and CSS transitions together, we can achieve smooth entry and exit effects for popovers. Keyframes like ",e(n.code,{children:"popover-grow"})," and ",e(n.code,{children:"popover-shrink"})," handle scaling and visibility, while transitions focus on gradual changes to properties like ",e(n.code,{children:"opacity"}),". Remember to include ",e(n.code,{children:"display"})," and ",e(n.code,{children:"overlay"})," in your transition properties and use ",e(n.code,{children:"transition-behavior: allow-discrete"})," to ensure smooth animations across all browsers."]}),`
`,e(n.h2,{id:"additional-references",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#additional-references",children:e(n.span,{class:"icon icon-link"})}),"Additional References"]}),`
`,e(n.p,{children:"Qwik UI aims to be in line with the standard whenever possible. Our goal is to empower Qwik developers to create amazing experiences for their users."}),`
`,e(n.p,{children:"To read more about the popover API you can check it out on:"}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:e(n.a,{href:"https://developer.mozilla.org/en-US/docs/Web/API/Popover_API",children:"MDN"})}),`
`,e(n.li,{children:e(n.a,{href:"https://open-ui.org/components/popover.research.explainer/",children:"Open UI Proposal"})}),`
`,e(n.li,{children:e(n.a,{href:"https://developer.chrome.com/blog/what-is-the-top-layer/",children:"What is the top layer?"})}),`
`]}),`
`,e(n.h3,{id:"popover-root",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#popover-root",children:e(n.span,{class:"icon icon-link"})}),"Popover Root"]}),`
`,e(l,{propDescriptors:[{name:"id",type:"string",description:"Popover's id. Should match the popover target."},{name:"manual",type:"boolean",description:"A manual popover needs to be manually hidden, such as toggling the button or programmatically."},{name:"floating",type:"boolean | Placement",description:"Enables extra JavaScript behavior for floating elements."},{name:"strategy",type:"absolute | fixed",description:"The strategy to use when positioning the floating element. The default value is absolute, which suites most cases, while fixed position might be better in legacy browsers like iOS 15.4."},{name:"anchorRef",type:"Signal",description:"Signal reference that can be passed for floating behavior."},{name:"flip",type:"boolean",description:"Flips the placement of the popover when it starts to collide with the boundaries."},{name:"gutter",type:"number",description:"The space between the floating element and the anchored element."},{name:"[popover]",type:"selector",description:"Selects the popover on all browsers."},{name:"data-open",type:"selector",description:"Style the element when the popover is open."},{name:"data-closed",type:"selector",description:"Style the element when the popover is closed."}]}),`
`,e(n.h3,{id:"popover-panel",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#popover-panel",children:e(n.span,{class:"icon icon-link"})}),"Popover Panel"]}),`
`,e(l,{propDescriptors:[{name:"onToggle",type:"QRL",description:"Function called when the popover opens or closes",info:"QRL<(event: CorrectedToggleEvent, element: HTMLDivElement) => void>"}]}),`
`,e(n.h3,{id:"usepopover-hook",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usepopover-hook",children:e(n.span,{class:"icon icon-link"})}),"usePopover hook"]}),`
`,e(l,{propDescriptors:[{name:"showPopover()",type:"QRL",description:"Opens the popover."},{name:"hidePopover()",type:"QRL",description:"Closes the popover."},{name:"togglePopover()",type:"QRL",description:"Toggles the popover between the open and closed state."}]}),`
`,e(w,{})]})},"_createMdxContent_0",[]));function a(r,n,l){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/popover/index.mdx: Expected component `"+r+"` to be defined: you likely forgot to import, pass, or provide it.")}const G=(r={})=>{const n=m(g,{children:m(Q,r,3,null)},3,"WjO403mZ");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{G as default,H as frontmatter,N as head,z as headings};
