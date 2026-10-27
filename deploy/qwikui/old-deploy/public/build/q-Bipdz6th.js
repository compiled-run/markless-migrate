import{t as s,N as c,z as a,O as i,S as l,U as p,D as o}from"./q-CsvfasCP.js";import{u as d}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as t}from"./q-BKZ00VYc.js";const y=s(c(()=>t(()=>import("./q-BODba5BJ.js"),[]),"s_AttZ8xQRk08")),C=s(c(()=>t(()=>import("./q-CSM8x-c4.js"),[]),"s_1oruJWIEvNM")),A=s(c(()=>t(()=>import("./q-vYmguz_n.js"),[]),"s_03Yc46jS8us")),m=[{text:"Toggle Group",id:"toggle-group",level:1},{text:"Installation",id:"installation",level:2},{text:"Usage",id:"usage",level:2}],f={title:"Qwik UI | Styled Toggle Group Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},T={title:"Qwik UI | Styled Toggle Group Component"},D=s(p(n=>{const e={a:"a",code:"code",h1:"h1",h2:"h2",p:"p",pre:"pre",span:"span",strong:"strong",...d(),...n.components},{StatusBanner:r}=e;return r||g("StatusBanner"),l(o,{children:[l(r,{status:h.styled.ToggleGroup}),`
`,l(e.h1,{id:"toggle-group",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#toggle-group",children:l(e.span,{class:"icon icon-link"})}),"Toggle Group"]}),`
`,l(e.p,{children:"A set of two-state buttons that can be toggled on or off."}),`
`,l(y,{}),`
`,l(e.p,{children:"You can choose a multiple selection variant:"}),`
`,l(C,{}),`
`,l(e.p,{children:["And here is the default look for a disabled ",l(e.code,{children:"ToggleGroup.Root"}),":"]}),`
`,l(A,{}),`
`,l("span",{class:"flex flex-1 gap-1 font-medium",children:[l(e.p,{children:"To see all features and the API checkout our"}),l("a",{href:"/docs/headless/toggle-group",class:"text-blue-500 hover:underline",children:l(e.p,{children:"Headless component"})})]}),`
`,l(e.h2,{id:"installation",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(e.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(e.p,{children:l(e.strong,{children:"Run the following cli command or copy/paste the component code into your project"})}),`
`,l(o,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add toggle-group",children:l(e.code,{children:l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(e.span,{style:{color:"#ADD7FF"},children:" add"}),l(e.span,{style:{color:"#ADD7FF"},children:" toggle-group"})]})})})}),`
`,l(o,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, type PropsOf, Slot } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';
import { ToggleGroup as HeadlessToggleGroup } from '@qwik-ui/headless';

import type { VariantProps } from 'class-variance-authority';

import { toggleVariants } from '../toggle/toggle';

type ToggleGroupRootProps = PropsOf<typeof HeadlessToggleGroup.Root>;

const Root = component$<ToggleGroupRootProps>(({ ...props }) => {
  return (
    <HeadlessToggleGroup.Root
      {...props}
      class={cn('flex items-center gap-1', props.class)}
    >
      <Slot />
    </HeadlessToggleGroup.Root>
  );
});

type ToggleGroupItemProps = PropsOf<typeof HeadlessToggleGroup.Item> &
  VariantProps<typeof toggleVariants>;

const Item = component$<ToggleGroupItemProps>(({ size, look, ...props }) => {
  return (
    <HeadlessToggleGroup.Item
      {...props}
      class={cn(toggleVariants({ size, look }), props.class)}
    >
      <Slot />
    </HeadlessToggleGroup.Item>
  );
});

export const ToggleGroup = {
  Root,
  Item,
};`,children:l(e.code,{children:[l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#A6ACCD"},children:" type"}),l(e.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" cn"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" ToggleGroup"}),l(e.span,{style:{color:"#A6ACCDC0"},children:" as"}),l(e.span,{style:{color:"#ADD7FF"},children:" HeadlessToggleGroup"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"type"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"}),l(e.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" toggleVariants"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"../toggle/toggle"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"type"}),l(e.span,{style:{color:"#A6ACCD"},children:" ToggleGroupRootProps"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessToggleGroup"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Root"}),l(e.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Root"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"ToggleGroupRootProps"}),l(e.span,{style:{color:"#A6ACCD"},children:">(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessToggleGroup.Root"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#5DE4C7"},children:"flex items-center gap-1"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#E4F0FB"},children:" props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:")"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessToggleGroup.Root"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"type"}),l(e.span,{style:{color:"#A6ACCD"},children:" ToggleGroupItemProps"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessToggleGroup"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Item"}),l(e.span,{style:{color:"#A6ACCD"},children:">"}),l(e.span,{style:{color:"#91B4D5"},children:" &"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCDC0"},children:"  VariantProps"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" toggleVariants"}),l(e.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Item"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"ToggleGroupItemProps"}),l(e.span,{style:{color:"#A6ACCD"},children:">(({ "}),l(e.span,{style:{color:"#E4F0FB"},children:"size"}),l(e.span,{style:{color:"#A6ACCD"},children:", "}),l(e.span,{style:{color:"#E4F0FB"},children:"look"}),l(e.span,{style:{color:"#A6ACCD"},children:", "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessToggleGroup.Item"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("}),l(e.span,{style:{color:"#E4F0FBD0"},children:"toggleVariants"}),l(e.span,{style:{color:"#A6ACCD"},children:"({"}),l(e.span,{style:{color:"#E4F0FB"},children:" size"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#E4F0FB"},children:" look"}),l(e.span,{style:{color:"#A6ACCD"},children:" }),"}),l(e.span,{style:{color:"#E4F0FB"},children:" props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:")"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessToggleGroup.Item"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"export"}),l(e.span,{style:{color:"#91B4D5"},children:" const"}),l(e.span,{style:{color:"#E4F0FB"},children:" ToggleGroup"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Item"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"};"})})]})})}),`
`,l(e.h2,{id:"usage",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(e.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(o,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { ToggleGroup } from '~/components/ui';",children:l(e.code,{children:l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" ToggleGroup"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(o,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<ToggleGroup.Root type="multiple">
  <ToggleGroup.Item value="left" aria-label="Left aligned">
    Left
  </ToggleGroup.Item>
  <ToggleGroup.Item value="center" aria-label="Center aligned">
    Center
  </ToggleGroup.Item>
  <ToggleGroup.Item value="right" aria-label="Right aligned">
    Right
  </ToggleGroup.Item>
</ToggleGroup.Root>`,children:l(e.code,{children:[l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"<"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Root"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" type"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"multiple"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  <"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" value"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"left"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-label"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"Left aligned"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    Left"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  </"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  <"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" value"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"center"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-label"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"Center aligned"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    Center"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  </"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  <"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" value"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"right"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-label"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"Right aligned"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    Right"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  </"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Item"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"</"}),l(e.span,{style:{color:"#5DE4C7"},children:"ToggleGroup.Root"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]})]})})})]})},"_createMdxContent_0",[]));function g(n,e,r){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/toggle-group/index.mdx: Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}const G=(n={})=>{const e=a(i,{children:a(D,n,3,null)},3,"6gXvGmMu");return typeof MDXLayout=="function"?l(MDXLayout,{children:e}):e};export{G as default,T as frontmatter,f as head,m as headings};
