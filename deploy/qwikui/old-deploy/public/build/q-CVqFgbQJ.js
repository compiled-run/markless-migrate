import{t as c,N as i,z as r,O as t,S as l,U as a,D as o}from"./q-CsvfasCP.js";import{u as d}from"./q-D_NppxYb.js";import{s as p}from"./q-BnEU7A_-.js";import{_ as h}from"./q-BKZ00VYc.js";const y=c(i(()=>h(()=>import("./q-CH6rV278.js"),[]),"s_4lw1zYzjuTk")),u=[{text:"Tooltip",id:"tooltip",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Usage",id:"usage",level:2}],B={title:"Qwik UI | Styled Tooltip Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},f={title:"Qwik UI | Styled Tooltip Component"},C=c(a(e=>{const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...d(),...e.components},{StatusBanner:s}=n;return s||A("StatusBanner"),l(o,{children:[l(s,{status:p.styled.Tooltip}),`
`,l(n.h1,{id:"tooltip",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tooltip",children:l(n.span,{class:"icon icon-link"})}),"Tooltip"]}),`
`,l(n.p,{children:"A text label that appears when a user hovers, focuses, or touches an element."}),`
`,l(y,{}),`
`,l(n.h2,{id:"installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(n.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add tooltip",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" tooltip"})]})})})}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { type PropsOf, Slot, component$ } from '@builder.io/qwik';
import { Tooltip as HeadlessTooltip } from '@qwik-ui/headless';
import { cn } from '@qwik-ui/utils';

const Root = component$<PropsOf<typeof HeadlessTooltip.Root>>(({ ...props }) => {
  return (
    <HeadlessTooltip.Root {...props}>
      <Slot />
    </HeadlessTooltip.Root>
  );
});

const Trigger = HeadlessTooltip.Trigger;

const Panel = component$<PropsOf<typeof HeadlessTooltip.Panel>>(({ ...props }) => {
  return (
    <HeadlessTooltip.Panel
      {...props}
      class={cn(
        'w-fit animate-in rounded-md border bg-background px-3 py-1.5 text-xs text-balance text-foreground shadow-sm fade-in-0 zoom-in-95',
        'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        props.class,
      )}
    >
      <Slot />
    </HeadlessTooltip.Panel>
  );
});

export const Tooltip = {
  Root,
  Trigger,
  Panel,
};`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Tooltip"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" as"}),l(n.span,{style:{color:"#ADD7FF"},children:" HeadlessTooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cn"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Root"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessTooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Root"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessTooltip.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessTooltip.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Trigger"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessTooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Trigger"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Panel"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessTooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Panel"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessTooltip.Panel"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"w-fit animate-in rounded-md border bg-background px-3 py-1.5 text-xs text-balance text-foreground shadow-sm fade-in-0 zoom-in-95"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"      )"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessTooltip.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Tooltip"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Trigger"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Panel"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"};"})})]})})}),`
`,l(n.h2,{id:"usage",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(n.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Tooltip } from '~/components/ui';",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Tooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Tooltip.Root>
  <Tooltip.Trigger>Open Trigger</Tooltip.Trigger>
  <Tooltip.Panel>Place your content here.</Tooltip.Panel>
</Tooltip.Root>`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"<"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">Open Trigger</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">Place your content here.</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Tooltip.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})})]})},"_createMdxContent_0",[]));function A(e,n,s){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/tooltip/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const g=(e={})=>{const n=r(t,{children:r(C,e,3,null)},3,"EYMK9VVp");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{g as default,f as frontmatter,B as head,u as headings};
