import{t as r,N as i,z as c,O as a,S as l,U as t,D as o}from"./q-CsvfasCP.js";import{u as d}from"./q-D_NppxYb.js";import{s as p}from"./q-BnEU7A_-.js";import{_ as h}from"./q-BKZ00VYc.js";const y=r(i(()=>h(()=>import("./q-ChowzOeu.js"),[]),"s_DPOPOa1TNlQ")),m=[{text:"Accordion",id:"accordion",level:1},{text:"Installation",id:"installation",level:2},{text:"1. Run the following cli command or copy/paste the component code into your project",id:"1-run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Usage",id:"usage",level:2}],f={title:"Qwik UI | Styled Accordion Component",meta:[{name:"description",content:"A vertically stacked set of interactive headings that each reveal a section of content. Copy/paste into your project from the documentation or by using the CLI. Easily customize the CVA variants according to your brand requirements."}],styles:[],links:[],scripts:[],frontmatter:{}},u={title:"Qwik UI | Styled Accordion Component",description:"A vertically stacked set of interactive headings that each reveal a section of content. Copy/paste into your project from the documentation or by using the CLI. Easily customize the CVA variants according to your brand requirements."},C=r(t(e=>{const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...d(),...e.components},{StatusBanner:s}=n;return s||A("StatusBanner"),l(o,{children:[l(s,{status:p.styled.Accordion}),`
`,l(n.h1,{id:"accordion",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#accordion",children:l(n.span,{class:"icon icon-link"})}),"Accordion"]}),`
`,l(n.p,{children:"A vertically stacked set of interactive headings that each reveal a section of content."}),`
`,l(y,{}),`
`,l(n.h2,{id:"installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(n.h3,{id:"1-run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#1-run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"1. Run the following cli command or copy/paste the component code into your project"]}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add accordion",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" accordion"})]})})})}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, Slot, type PropsOf } from '@builder.io/qwik';

import { Accordion as HeadlessAccordion } from '@qwik-ui/headless';
import { cn } from '@qwik-ui/utils';

import { LuChevronDown } from '@qwikest/icons/lucide';

const Root = (props: PropsOf<typeof HeadlessAccordion.Root>) => (
  <HeadlessAccordion.Root {...props} accordionItemComponent={Item}>
    {props.children}
  </HeadlessAccordion.Root>
);

const Item = component$<PropsOf<typeof HeadlessAccordion.Item>>((props) => {
  return (
    <HeadlessAccordion.Item {...props} class={cn('border-b', props.class)}>
      <Slot />
    </HeadlessAccordion.Item>
  );
});

const Trigger = component$<
  PropsOf<typeof HeadlessAccordion.Trigger> & {
    header?: PropsOf<typeof HeadlessAccordion.Header>['as'];
  }
>(({ header = 'h3', ...props }) => {
  return (
    <HeadlessAccordion.Header as={header} class="flex">
      <HeadlessAccordion.Trigger
        {...props}
        class={cn(
          'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-open]>svg]:rotate-180',
          props.class,
        )}
      >
        <Slot />
        <LuChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      </HeadlessAccordion.Trigger>
    </HeadlessAccordion.Header>
  );
});

const Content = component$<PropsOf<typeof HeadlessAccordion.Content>>((props) => {
  return (
    <HeadlessAccordion.Content
      {...props}
      class={cn(
        'overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down',
        props.class,
      )}
    >
      <div class="pt-0 pb-4">
        <Slot />
      </div>
    </HeadlessAccordion.Content>
  );
});

export const Accordion = {
  Root,
  Item,
  Trigger,
  Content,
};`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Accordion"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" as"}),l(n.span,{style:{color:"#ADD7FF"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cn"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" LuChevronDown"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwikest/icons/lucide"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#ADD7FF"},children:" Root"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" ("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#91B4D5"},children:":"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Root"}),l(n.span,{style:{color:"#A6ACCD"},children:">) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"accordionItemComponent"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{Item}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    {props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"children}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Item"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Item"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"border-b"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Trigger"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" component$"}),l(n.span,{style:{color:"#91B4D5"},children:"<"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  PropsOf"}),l(n.span,{style:{color:"#91B4D5"},children:"<typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Trigger"}),l(n.span,{style:{color:"#91B4D5"},children:">"}),l(n.span,{style:{color:"#91B4D5"},children:" &"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    header"}),l(n.span,{style:{color:"#91B4D5"},children:"?:"}),l(n.span,{style:{color:"#E4F0FB"},children:" PropsOf"}),l(n.span,{style:{color:"#91B4D5"},children:"<typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Header"}),l(n.span,{style:{color:"#91B4D5"},children:">"}),l(n.span,{style:{color:"#A6ACCD"},children:"["}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"as"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:"];"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:">"}),l(n.span,{style:{color:"#A6ACCD"},children:"(({ "}),l(n.span,{style:{color:"#E4F0FB"},children:"header"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"h3"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Header"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" as"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{header} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"flex"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Trigger"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"        class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"          '"}),l(n.span,{style:{color:"#5DE4C7"},children:"flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-open]>svg]:rotate-180"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"          props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        )"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"      >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        <"}),l(n.span,{style:{color:"#5DE4C7"},children:"LuChevronDown"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Header"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Content"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessAccordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Content"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Content"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"      )"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"pt-0 pb-4"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      </"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessAccordion.Content"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Accordion"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Item"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Trigger"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Content"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"};"})})]})})}),`
`,l(n.h2,{id:"usage",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(n.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Accordion } from '~/components/ui';",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Accordion"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(o,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Accordion.Root behavior="single" collapsible class="w-full">
  <Accordion.Item id="item-1">
    <Accordion.Trigger>Is it accessible?</Accordion.Trigger>
    <Accordion.Content>Yes. It adheres to the WAI-ARIA design pattern.</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"<"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Root"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" behavior"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"single"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" collapsible"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"w-full"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Item"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" id"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"item-1"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">Is it accessible?</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Content"}),l(n.span,{style:{color:"#E4F0FB"},children:">Yes. It adheres to the WAI-ARIA design pattern.</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Content"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Accordion.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})})]})},"_createMdxContent_0",[]));function A(e,n,s){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/accordion/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const g=(e={})=>{const n=c(a,{children:c(C,e,3,null)},3,"G6xGzEvN");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{g as default,u as frontmatter,f as head,m as headings};
