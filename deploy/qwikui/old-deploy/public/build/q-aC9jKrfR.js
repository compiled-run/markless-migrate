import{t as o,N as a,z as c,O as i,S as l,U as t,D as s}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as d}from"./q-BnEU7A_-.js";import{_ as h}from"./q-BKZ00VYc.js";const y=o(a(()=>h(()=>import("./q-Dp7GCD8n.js"),[]),"s_6F1YbPsP1fM")),m=[{text:"Breadcrumb",id:"breadcrumb",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Usage",id:"usage",level:2}],u={title:"Qwik UI | Styled Breadcrumb Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},b={title:"Qwik UI | Styled Breadcrumb Component"},C=o(t(e=>{const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...p(),...e.components},{StatusBanner:r}=n;return r||D("StatusBanner"),l(s,{children:[l(r,{status:d.styled.Breadcrumb}),`
`,l(n.h1,{id:"breadcrumb",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#breadcrumb",children:l(n.span,{class:"icon icon-link"})}),"Breadcrumb"]}),`
`,l(n.p,{children:"Displays the path to the current resource using a hierarchy of links."}),`
`,l(y,{}),`
`,l(n.h2,{id:"installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(n.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add breadcrumb",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" breadcrumb"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { type PropsOf, Slot, component$ } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';
import { LuChevronRight } from '@qwikest/icons/lucide';

export type BreadcrumbProps = PropsOf<'nav'>;
const Root = component$<BreadcrumbProps>(() => {
  return (
    <nav aria-label="breadcrumb">
      <Slot />
    </nav>
  );
});

const List = component$<PropsOf<'ol'>>((props) => {
  return (
    <ol
      {...props}
      class={cn(
        'flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5',
        props.class,
      )}
    >
      <Slot />
    </ol>
  );
});

const Item = component$<PropsOf<'li'>>((props) => {
  return (
    <li {...props} class={cn('inline-flex items-center gap-1.5', props.class)}>
      <Slot />
    </li>
  );
});

const Link = component$<PropsOf<'a'> & { asChild?: boolean }>((props) => {
  const Comp = props.asChild ? Slot : 'a';
  return (
    <Comp
      {...props}
      class={cn(
        'text-muted-foreground transition-colors hover:text-foreground',
        props.class,
      )}
    >
      {!props.asChild && <Slot />}
    </Comp>
  );
});

const Separator = component$<PropsOf<'li'>>((props) => {
  return (
    <li role="presentation" aria-hidden="true" {...props}>
      <LuChevronRight class="size-3.5 stroke-muted-foreground stroke-2" />
    </li>
  );
});

const Page = component$<PropsOf<'span'>>((props) => {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      {...props}
      class={cn('font-normal text-foreground', props.class)}
    >
      <Slot />
    </span>
  );
});

export const Breadcrumb = { Root, List, Item, Link, Separator, Page };`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cn"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" LuChevronRight"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwikest/icons/lucide"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" type"}),l(n.span,{style:{color:"#A6ACCD"},children:" BreadcrumbProps"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"nav"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Root"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"BreadcrumbProps"}),l(n.span,{style:{color:"#A6ACCD"},children:">(() "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"nav"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-label"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"breadcrumb"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"nav"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" List"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"ol"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"ol"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"      )"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"ol"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Item"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"inline-flex items-center gap-1.5"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Link"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"a"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:"> "}),l(n.span,{style:{color:"#91B4D5"},children:"&"}),l(n.span,{style:{color:"#A6ACCD"},children:" { asChild"}),l(n.span,{style:{color:"#91B4D5"},children:"?:"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" boolean"}),l(n.span,{style:{color:"#A6ACCD"},children:" }>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"  const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Comp"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"asChild"}),l(n.span,{style:{color:"#91B4D5"},children:" ?"}),l(n.span,{style:{color:"#E4F0FB"},children:" Slot"}),l(n.span,{style:{color:"#91B4D5"},children:" :"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"a"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Comp"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"        '"}),l(n.span,{style:{color:"#5DE4C7"},children:"text-muted-foreground transition-colors hover:text-foreground"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"        props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"      )"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"!"}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"asChild "}),l(n.span,{style:{color:"#91B4D5"},children:"&&"}),l(n.span,{style:{color:"#E4F0FB"},children:" <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Comp"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Separator"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" role"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"presentation"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" aria-hidden"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"true"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"LuChevronRight"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"size-3.5 stroke-muted-foreground stroke-2"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"li"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Page"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"span"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(("}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:") "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"span"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      role"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"link"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      aria-disabled"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"true"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      aria-current"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"page"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"font-normal text-foreground"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"span"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Breadcrumb"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" {"}),l(n.span,{style:{color:"#E4F0FB"},children:" Root"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" List"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" Item"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" Link"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" Separator"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" Page"}),l(n.span,{style:{color:"#A6ACCD"},children:" };"})]})]})})}),`
`,l(n.h2,{id:"usage",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(n.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Breadcrumb } from '~/components/ui';",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Breadcrumb"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Breadcrumb.Root>
  <Breadcrumb.List>
    <Breadcrumb.Item>
      <Breadcrumb.Link href="/">Home</Breadcrumb.Link>
    </Breadcrumb.Item>
    <Breadcrumb.Separator />
    <Breadcrumb.Item>
      <Breadcrumb.Link href="/">Components</Breadcrumb.Link>
    </Breadcrumb.Item>
    <Breadcrumb.Separator />
    <Breadcrumb.Item>
      <Breadcrumb.Page>Breadcrumb</Breadcrumb.Page>
    </Breadcrumb.Item>
  </Breadcrumb.List>
</Breadcrumb.Root>`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"<"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.List"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Link"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" href"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"/"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">Home</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Link"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Separator"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Link"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" href"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"/"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:">Components</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Link"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Separator"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Page"}),l(n.span,{style:{color:"#E4F0FB"},children:">Breadcrumb</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Page"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Item"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.List"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Breadcrumb.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})})]})},"_createMdxContent_0",[]));function D(e,n,r){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/breadcrumb/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const f=(e={})=>{const n=c(i,{children:c(C,e,3,null)},3,"Hl6jdOJG");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{f as default,b as frontmatter,u as head,m as headings};
