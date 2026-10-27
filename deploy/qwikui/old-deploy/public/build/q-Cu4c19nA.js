import{t as o,N as i,z as y,O as f,S as e,U as g,D as c}from"./q-CsvfasCP.js";import{u as b}from"./q-D_NppxYb.js";import{s as w}from"./q-BnEU7A_-.js";import{_ as t}from"./q-BKZ00VYc.js";const v=o(i(()=>t(()=>import("./q-CuLzCfsj.js"),[]),"s_Ix8n85tMXlY")),A=o(i(()=>t(()=>import("./q-BeZbya2M.js"),[]),"s_F8ND9KCx9ek")),C=o(i(()=>t(()=>import("./q-aAkKZUPh.js"),[]),"s_5poddB4crko")),x=o(i(()=>t(()=>import("./q-D4vDDrW4.js"),[]),"s_xvzFBdMzWKU")),T=o(i(()=>t(()=>import("./q-HdHpEzs-.js"),[]),"s_6VjpPwbxwgA")),D=o(i(()=>t(()=>import("./q-Ceinc12h.js"),[]),"s_c03ByHVF05w")),E=o(i(()=>t(()=>import("./q-BOvv_yr0.js"),[]),"s_6ihiJ2xyN4g")),_=o(i(()=>t(()=>import("./q-DRXjWGT6.js"),[]),"s_UxbgC8i0hoI")),F=o(i(()=>t(()=>import("./q-CknBqkM_.js"),[]),"s_VMHuuDKDRIQ")),k=o(i(()=>t(()=>import("./q-DJaiR2R6.js"),[]),"s_t5pe5Ja5HoU")),B=o(i(()=>t(()=>import("./q-BlScLQex.js"),[]),"s_mzHmXe0uq8w")),U=[{text:"Tooltip",id:"tooltip",level:1},{text:"Building blocks",id:"building-blocks",level:2},{text:"Anatomy Table",id:"anatomy-table",level:3},{text:"What is a Tooltip?",id:"what-is-a-tooltip",level:2},{text:"When would I use a tooltip?",id:"when-would-i-use-a-tooltip",level:3},{text:"Use case examples",id:"use-case-examples",level:2},{text:"Caveats",id:"caveats",level:2},{text:"Styling open tooltips",id:"styling-open-tooltips",level:3},{text:"Tooltip Behavior",id:"tooltip-behavior",level:2},{text:"Floating Behavior",id:"floating-behavior",level:2},{text:"Custom Floating Position",id:"custom-floating-position",level:3},{text:"Flip",id:"flip",level:3},{text:"Gutter",id:"gutter",level:3},{text:"Styling",id:"styling",level:2},{text:"Animations",id:"animations",level:2},{text:"Keyframe Animation Example",id:"keyframe-animation-example",level:3},{text:"Transition declarations",id:"transition-declarations",level:3},{text:"Events",id:"events",level:2},{text:"Additional References",id:"additional-references",level:2},{text:"Tooltip Root",id:"tooltip-root",level:3},{text:"Tooltip Components",id:"tooltip-components",level:3},{text:"Example Usages",id:"example-usages",level:3},{text:"Basic:",id:"basic",level:4},{text:"Complex HTML:",id:"complex-html",level:4}],O={title:"Qwik UI | Tooltip",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},M={title:"Qwik UI | Tooltip"},S=o(g(a=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",h4:"h4",li:"li",p:"p",pre:"pre",span:"span",ul:"ul",...b(),...a.components},{APITable:s,AnatomyTable:r,BrowserAnimationsCompatability:d,FeatureList:h,Note:p,StatusBanner:m,TopLayerAnimationsCaveats:u}=n;return s||l("APITable"),r||l("AnatomyTable"),d||l("BrowserAnimationsCompatability"),h||l("FeatureList"),p||l("Note"),m||l("StatusBanner"),u||l("TopLayerAnimationsCaveats"),e(c,{children:[e(m,{status:w.headless.Tooltip}),`
`,`
`,e(n.h1,{id:"tooltip",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tooltip",children:e(n.span,{class:"icon icon-link"})}),"Tooltip"]}),`
`,e(n.p,{children:"A text label that appears when a user hovers, focuses, or touches an element."}),`
`,e(v,{}),`
`,e(h,{features:["Opens on hover or focus","Closes on trigger activation or Escape key press","Customizable open/close delays","Always portaled content","Accessibility with ARIA roles and keyboard interactions","Flipping to avoid overflow","Automatic placement adjustment","Supports RTL"]}),`
`,e(n.p,{children:"The Qwik UI Tooltip component provides additional information or context on hover, focus, or touch. It ensures accessibility and positioning with built-in ARIA roles and automatic placement adjustments."}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(c,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$ } from '@builder.io/qwik';
import { Tooltip } from '@qwik-ui/headless';

export default component$(() => {
  return (
    <Tooltip.Root delayDuration={800} gutter={4} flip placement="top">
      <Tooltip.Trigger>
        <button>Hover or Focus me</button>
      </Tooltip.Trigger>
      <Tooltip.Panel aria-label="Tooltip content">Tooltip content here</Tooltip.Panel>
    </Tooltip.Root>
  );
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" component$"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" Tooltip"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"export default "}),e(n.span,{style:{color:"#E4F0FBD0"},children:"component$"}),e(n.span,{style:{color:"#A6ACCD"},children:"(()"}),e(n.span,{style:{color:"#91B4D5"},children:" =>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Root"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" delayDuration"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FB"},children:"{"}),e(n.span,{style:{color:"#5DE4C7"},children:"800"}),e(n.span,{style:{color:"#E4F0FB"},children:"} "}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"gutter"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FB"},children:"{"}),e(n.span,{style:{color:"#5DE4C7"},children:"4"}),e(n.span,{style:{color:"#E4F0FB"},children:"} "}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"flip"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" placement"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"top"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Trigger"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"        <"}),e(n.span,{style:{color:"#5DE4C7"},children:"button"}),e(n.span,{style:{color:"#E4F0FB"},children:">Hover or Focus me</"}),e(n.span,{style:{color:"#5DE4C7"},children:"button"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      </"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Trigger"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Panel"}),e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-label"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip content"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#E4F0FB"},children:">Tooltip content here</"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Panel"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    </"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Root"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.h3,{id:"anatomy-table",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#anatomy-table",children:e(n.span,{class:"icon icon-link"})}),"Anatomy Table"]}),`
`,e(r,{propDescriptors:[{name:"Tooltip.Root",description:"The parent container for the tooltip trigger and panel."},{name:"Tooltip.Trigger",description:"An element that opens the tooltip when interacted with."},{name:"Tooltip.Panel",description:"An HTML element that contains the tooltip content."}]}),`
`,e(n.h2,{id:"what-is-a-tooltip",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#what-is-a-tooltip",children:e(n.span,{class:"icon icon-link"})}),"What is a Tooltip?"]}),`
`,e(n.p,{children:"A tooltip is a small text label that appears when a user hovers over, focuses on, or touches an element. It provides additional information or context."}),`
`,e(n.h3,{id:"when-would-i-use-a-tooltip",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#when-would-i-use-a-tooltip",children:e(n.span,{class:"icon icon-link"})}),"When would I use a tooltip?"]}),`
`,e(n.p,{children:"Tooltips are useful for displaying contextual information or additional details about an element without cluttering the UI. They enhance user experience by providing necessary information only when needed."}),`
`,e(n.h2,{id:"use-case-examples",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#use-case-examples",children:e(n.span,{class:"icon icon-link"})}),"Use case examples"]}),`
`,e(r,{propDescriptors:[{name:"Form Field",description:"Provide additional information or guidance about a form field."},{name:"Button",description:"Explain what an action button does."},{name:"Icon",description:"Give more context or definition to an icon."}]}),`
`,e(n.h2,{id:"caveats",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#caveats",children:e(n.span,{class:"icon icon-link"})}),"Caveats"]}),`
`,e(p,{status:"warning",children:e(n.p,{children:`While we handle most of the hard stuff, there are some details that should be
considered.`})}),`
`,e(n.h3,{id:"styling-open-tooltips",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#styling-open-tooltips",children:e(n.span,{class:"icon icon-link"})}),"Styling open tooltips"]}),`
`,e(c,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`.tooltip-panel[data-open] {
  background: lightblue;
}`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"tooltip"}),e(n.span,{style:{color:"#91B4D5"},children:"-"}),e(n.span,{style:{color:"#E4F0FB"},children:"panel"}),e(n.span,{style:{color:"#A6ACCD"},children:"["}),e(n.span,{style:{color:"#E4F0FB"},children:"data"}),e(n.span,{style:{color:"#91B4D5"},children:"-"}),e(n.span,{style:{color:"#E4F0FB"},children:"open"}),e(n.span,{style:{color:"#A6ACCD"},children:"] {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  background"}),e(n.span,{style:{color:"#A6ACCD"},children:": "}),e(n.span,{style:{color:"#E4F0FB"},children:"lightblue"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,e(n.p,{children:["Use the ",e(n.code,{children:"data-open"})," and ",e(n.code,{children:"data-closed"})," attributes on the ",e(n.code,{children:"<Tooltip.Panel>"})," component to specifically style the tooltip when it's open."]}),`
`,e(n.h2,{id:"tooltip-behavior",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tooltip-behavior",children:e(n.span,{class:"icon icon-link"})}),"Tooltip Behavior"]}),`
`,e(n.p,{children:"Tooltips show when hovering over or focusing on the trigger element and dismiss when moving the mouse away or losing focus."}),`
`,e(n.h2,{id:"floating-behavior",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#floating-behavior",children:e(n.span,{class:"icon icon-link"})}),"Floating Behavior"]}),`
`,e(n.p,{children:"By default, the Qwik UI Tooltip will float above the trigger component."}),`
`,e(A,{}),`
`,e(n.p,{children:"To make a tooltip float, we use JavaScript to choose where the tooltip should be positioned."}),`
`,e(n.h3,{id:"custom-floating-position",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#custom-floating-position",children:e(n.span,{class:"icon icon-link"})}),"Custom Floating Position"]}),`
`,e(n.p,{children:"By default, tooltips will float above the trigger component."}),`
`,e(n.p,{children:["When setting ",e(n.code,{children:"placement"})," on the root, you can customize the position of the tooltip."]}),`
`,e(C,{}),`
`,e(n.p,{children:["Above we have set the ",e(n.code,{children:"placement"})," prop to ",e(n.code,{children:"right"}),", so the ",e(n.code,{children:"<Tooltip.Panel>"})," will be positioned to the right of the trigger."]}),`
`,e(n.h3,{id:"flip",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#flip",children:e(n.span,{class:"icon icon-link"})}),"Flip"]}),`
`,e(n.p,{children:["Enabled by default, we can use the ",e(n.code,{children:"flip"})," prop to flip its position based on the available space in the viewport."]}),`
`,e(x,{}),`
`,e(n.p,{children:["To disable flipping, set ",e(n.code,{children:"flip={false}"})," on the ",e(n.code,{children:"<Tooltip.Root>"}),"."]}),`
`,e(n.h3,{id:"gutter",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#gutter",children:e(n.span,{class:"icon icon-link"})}),"Gutter"]}),`
`,e(n.p,{children:"The gutter property defines the space between the anchor element and the floating element."}),`
`,e(T,{}),`
`,e(n.h2,{id:"styling",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#styling",children:e(n.span,{class:"icon icon-link"})}),"Styling"]}),`
`,e(n.p,{children:"Styles can be added normally like any other component in Qwik UI, such as adding a class."}),`
`,e(n.p,{children:["If Tailwind is the framework of choice, then styles can be added using the ",e(n.a,{href:"https://tailwindcss.com/docs/hover-focus-and-other-states#using-arbitrary-variants",children:"arbitrary variant syntax"})," or ",e(n.a,{href:"https://tailwindcss.com/docs/reusing-styles#extracting-classes-with-apply",children:"@apply"})," command."]}),`
`,e(D,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["The arbitrary variant can be customized/abstracted even further by ",e(n.a,{href:"https://tailwindcss.com/docs/plugins#adding-variants",children:"adding a variant"})," as a plugin in the tailwind config."]}),`
`]}),`
`,e(n.h2,{id:"animations",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#animations",children:e(n.span,{class:"icon icon-link"})}),"Animations"]}),`
`,e(n.p,{children:"Tooltips rely on animations and transitions to provide smooth entry and exit effects. Like the Popover, tooltips benefit from modern CSS capabilities that allow animating between display: none and display: block. This ensures the tooltip remains visible for the entire duration of the animation."}),`
`,e(d,{}),`
`,e(n.h3,{id:"keyframe-animation-example",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#keyframe-animation-example",children:e(n.span,{class:"icon icon-link"})}),"Keyframe Animation Example"]}),`
`,e(E,{}),`
`,e(n.p,{children:"Keyframes are used for complex entry and exit animations. In this case:"}),`
`,e(n.p,{children:[e(n.code,{children:"tooltip-grow"})," animates the tooltip to grow from scale 0 to scale 1 when it opens."]}),`
`,e(n.p,{children:[e(n.code,{children:"tooltip-shrink"})," animates the tooltip to shrink from scale 1 to scale 0 when it closes, eventually setting ",e(n.code,{children:"display: none"}),"."]}),`
`,e(n.h3,{id:"transition-declarations",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#transition-declarations",children:e(n.span,{class:"icon icon-link"})}),"Transition declarations"]}),`
`,e(n.p,{children:"Transitions are ideal for animating properties like opacity and scale for smoother interactions:"}),`
`,e(_,{}),`
`,e(n.p,{children:["Here, transitions handle smooth opacity and scale changes. The ",e(n.code,{children:"transition-behavior: allow-discrete"})," ensures that ",e(n.code,{children:"display"})," and ",e(n.code,{children:"overlay"})," animate properly."]}),`
`,e(u,{}),`
`,e(n.h2,{id:"events",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#events",children:e(n.span,{class:"icon icon-link"})}),"Events"]}),`
`,e(n.p,{children:["The tooltip contains a ",e(n.code,{children:"onOpenChange$"}),` event that runs when the tooltip opens or closes.
This can be used to trigger additional actions when the tooltip is opened or closed.`]}),`
`,e(F,{}),`
`,e(n.h2,{id:"additional-references",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#additional-references",children:e(n.span,{class:"icon icon-link"})}),"Additional References"]}),`
`,e(n.p,{children:"Qwik UI aims to be in line with the standard whenever possible. Our goal is to empower Qwik developers to create amazing experiences for their users."}),`
`,e(n.p,{children:"To read more about tooltips you can check it out on:"}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:e(n.a,{href:"https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tooltip_role",children:"MDN"})}),`
`,e(n.li,{children:e(n.a,{href:"https://www.w3.org/TR/wai-aria-practices-1.1/#tooltip",children:"WAI-ARIA Authoring Practices"})}),`
`]}),`
`,e(n.h3,{id:"tooltip-root",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tooltip-root",children:e(n.span,{class:"icon icon-link"})}),"Tooltip Root"]}),`
`,e(s,{propDescriptors:[{name:"id",type:"string",description:"Tooltip's id. Should match the tooltip target."},{name:"delayDuration",type:"number",description:"A value that determines how long before the tooltip will be opened once triggered in milliseconds."},{name:"flip",type:"boolean",description:"Flips the placement of the tooltip when it starts to collide with the boundaries."},{name:"gutter",type:"number",description:"The space between the trigger element and the tooltip."},{name:"data-closing",type:"selector",description:"Style the element when the tooltip is closing. This occurs when the popover has a delay set."},{name:"data-closed",type:"selector",description:"Style the element when the tooltip is closed."},{name:"data-opening",type:"selector",description:"Style the element when the tooltip is in the process of opening. This occurs when the popover has a delay set."},{name:"data-open",type:"selector",description:"Style the element when the tooltip is open."},{name:"onOpenChange$",type:"QRL",description:"QRL handler that runs when the tooltip opens or closes.",info:'QRL<(state: "open" | "closed") => void>'}]}),`
`,e(n.h3,{id:"tooltip-components",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tooltip-components",children:e(n.span,{class:"icon icon-link"})}),"Tooltip Components"]}),`
`,e(s,{propDescriptors:[{name:"Tooltip.Trigger",description:"The element that triggers the tooltip."},{name:"Tooltip.Panel",description:"The container for the tooltip content."}]}),`
`,e(n.h3,{id:"example-usages",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#example-usages",children:e(n.span,{class:"icon icon-link"})}),"Example Usages"]}),`
`,e(n.h4,{id:"basic",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#basic",children:e(n.span,{class:"icon icon-link"})}),"Basic:"]}),`
`,e(k,{}),`
`,e(n.h4,{id:"complex-html",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#complex-html",children:e(n.span,{class:"icon icon-link"})}),"Complex HTML:"]}),`
`,e(B,{})]})},"_createMdxContent_0",[]));function l(a,n,s){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/tooltip/index.mdx: Expected component `"+a+"` to be defined: you likely forgot to import, pass, or provide it.")}const V=(a={})=>{const n=y(f,{children:y(S,a,3,null)},3,"FHYe00LM");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{V as default,M as frontmatter,O as head,U as headings};
