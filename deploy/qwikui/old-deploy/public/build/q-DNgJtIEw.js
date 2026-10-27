import{t as r,N as a,z as c,O as t,S as l,U as d,D as s}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as i}from"./q-BKZ00VYc.js";const y=r(a(()=>i(()=>import("./q-DpXpOF_P.js"),[]),"s_icsnE3ttcxI")),C=r(a(()=>i(()=>import("./q-CJZYPepi.js"),[]),"s_06YqrDZfI74")),u=[{text:"Modal",id:"modal",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Usage",id:"usage",level:2},{text:"Examples",id:"examples",level:2}],f={title:"Qwik UI | Styled Modal Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},g={title:"Qwik UI | Styled Modal Component"},A=r(d(e=>{const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...p(),...e.components},{StatusBanner:o}=n;return o||D("StatusBanner"),l(s,{children:[l(o,{status:h.styled.Modal}),`
`,l(n.h1,{id:"modal",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#modal",children:l(n.span,{class:"icon icon-link"})}),"Modal"]}),`
`,l(n.p,{children:"A window overlaid on either the primary window or another modal window, rendering the content underneath inert."}),`
`,l(y,{}),`
`,l(n.h2,{id:"installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(n.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add modal",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" modal"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { type PropsOf, Slot, component$ } from '@builder.io/qwik';
import { Modal as HeadlessModal } from '@qwik-ui/headless';
import { cn } from '@qwik-ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const Root = HeadlessModal.Root;

const Trigger = HeadlessModal.Trigger;

const Close = HeadlessModal.Close;

export const panelVariants = cva(
  [
    'fixed bg-background p-6 text-foreground transition-all backdrop:brightness-50 backdrop:backdrop-blur-xs',
    'data-closing:animate-out data-closing:duration-300 data-open:animate-in data-open:duration-300',
    'data-closing:backdrop:animate-out data-closing:backdrop:duration-300 data-closing:backdrop:fade-out data-open:backdrop:animate-in data-open:backdrop:duration-300 data-open:backdrop:fade-in',
  ],
  {
    variants: {
      position: {
        center:
          'rounded-base m-auto max-w-lg shadow-lg data-closed:zoom-out-95 data-closed:fade-out data-closing:backdrop:fade-out data-open:zoom-in-95 data-open:fade-in data-open:slide-in-from-bottom-2 data-open:backdrop:fade-in',
        top: 'rounded-b-base inset-x-0 top-0 mb-auto w-full border-b data-closing:slide-out-to-top data-open:slide-in-from-top',
        bottom:
          'rounded-t-base inset-x-0 bottom-0 mt-auto w-full border-t data-closing:slide-out-to-bottom data-open:slide-in-from-bottom',
        left: 'rounded-r-base inset-y-0 left-0 mr-auto h-full max-w-sm border-r data-closing:slide-out-to-left data-open:slide-in-from-left',
        right:
          'rounded-l-base inset-y-0 right-0 ml-auto h-full max-w-sm border-l data-closing:slide-out-to-right data-open:slide-in-from-right',
      },
    },
    defaultVariants: {
      position: 'center',
    },
  },
);

type PanelProps = PropsOf<typeof HeadlessModal.Panel> &
  VariantProps<typeof panelVariants>;

const Panel = component$<PanelProps>(({ position, ...props }) => {
  return (
    <HeadlessModal.Panel {...props} class={cn(panelVariants({ position }), props.class)}>
      <Slot />
    </HeadlessModal.Panel>
  );
});

const Title = component$<PropsOf<'h2'>>(({ ...props }) => {
  return (
    <HeadlessModal.Title
      {...props}
      class={cn('text-lg font-semibold tracking-tight', props.class)}
    >
      <Slot />
    </HeadlessModal.Title>
  );
});

const Description = component$<PropsOf<'p'>>(({ ...props }) => {
  return (
    <HeadlessModal.Description
      {...props}
      class={cn('text-sm text-muted-foreground', props.class)}
    >
      <Slot />
    </HeadlessModal.Description>
  );
});

export const Modal = {
  Root,
  Trigger,
  Close,
  Panel,
  Title,
  Description,
};`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Modal"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" as"}),l(n.span,{style:{color:"#ADD7FF"},children:" HeadlessModal"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cn"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cva"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Root"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessModal"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Root"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Trigger"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessModal"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Trigger"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Close"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessModal"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Close"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" panelVariants"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" cva"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  ["})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    '"}),l(n.span,{style:{color:"#5DE4C7"},children:"fixed bg-background p-6 text-foreground transition-all backdrop:brightness-50 backdrop:backdrop-blur-xs"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    '"}),l(n.span,{style:{color:"#5DE4C7"},children:"data-closing:animate-out data-closing:duration-300 data-open:animate-in data-open:duration-300"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    '"}),l(n.span,{style:{color:"#5DE4C7"},children:"data-closing:backdrop:animate-out data-closing:backdrop:duration-300 data-closing:backdrop:fade-out data-open:backdrop:animate-in data-open:backdrop:duration-300 data-open:backdrop:fade-in"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  ],"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"    variants"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"      position"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        center"}),l(n.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"          '"}),l(n.span,{style:{color:"#5DE4C7"},children:"rounded-base m-auto max-w-lg shadow-lg data-closed:zoom-out-95 data-closed:fade-out data-closing:backdrop:fade-out data-open:zoom-in-95 data-open:fade-in data-open:slide-in-from-bottom-2 data-open:backdrop:fade-in"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        top"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"rounded-b-base inset-x-0 top-0 mb-auto w-full border-b data-closing:slide-out-to-top data-open:slide-in-from-top"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        bottom"}),l(n.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"          '"}),l(n.span,{style:{color:"#5DE4C7"},children:"rounded-t-base inset-x-0 bottom-0 mt-auto w-full border-t data-closing:slide-out-to-bottom data-open:slide-in-from-bottom"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        left"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"rounded-r-base inset-y-0 left-0 mr-auto h-full max-w-sm border-r data-closing:slide-out-to-left data-open:slide-in-from-left"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        right"}),l(n.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"          '"}),l(n.span,{style:{color:"#5DE4C7"},children:"rounded-l-base inset-y-0 right-0 ml-auto h-full max-w-sm border-l data-closing:slide-out-to-right data-open:slide-in-from-right"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"    defaultVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"      position"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"center"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"type"}),l(n.span,{style:{color:"#A6ACCD"},children:" PanelProps"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" HeadlessModal"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"Panel"}),l(n.span,{style:{color:"#A6ACCD"},children:">"}),l(n.span,{style:{color:"#91B4D5"},children:" &"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCDC0"},children:"  VariantProps"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" panelVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Panel"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PanelProps"}),l(n.span,{style:{color:"#A6ACCD"},children:">(({ "}),l(n.span,{style:{color:"#E4F0FB"},children:"position"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#E4F0FBD0"},children:"panelVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:"({"}),l(n.span,{style:{color:"#E4F0FB"},children:" position"}),l(n.span,{style:{color:"#A6ACCD"},children:" }),"}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Title"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"h2"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Title"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"text-lg font-semibold tracking-tight"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Title"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Description"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"p"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Description"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"text-sm text-muted-foreground"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"HeadlessModal.Description"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Modal"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Trigger"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Close"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Panel"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Title"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Description"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"};"})})]})})}),`
`,l(n.h2,{id:"usage",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(n.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Button, Modal } from '~/components/ui';",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Button"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Modal"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Modal.Root bind:show={show}>
  <Modal.Trigger>Open modal</Modal.Trigger>
  <Modal.Panel>
    <Modal.Title>Title</Modal.Title>
    <Modal.Description>Description</Modal.Description>
    <div>...</div>
    <footer>
      <Button look="primary" onClick$={() => (show.value = false)}>
        Save
      </Button>
    </footer>
    <Modal.Close>
      <LuX class="h-5 w-5" />
    </Modal.Close>
  </Modal.Panel>
</Modal.Root>`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"<"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Root"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" bind"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"show"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{show}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">Open modal</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Trigger"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Title"}),l(n.span,{style:{color:"#E4F0FB"},children:">Title</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Title"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Description"}),l(n.span,{style:{color:"#E4F0FB"},children:">Description</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Description"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:">...</"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"footer"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Button"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" look"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"primary"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" onClick$"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#A6ACCD"},children:"()"}),l(n.span,{style:{color:"#91B4D5"},children:" =>"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("}),l(n.span,{style:{color:"#E4F0FB"},children:"show"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"value "}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#D0679D"},children:" false"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"        Save"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Button"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"footer"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Close"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"LuX"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"h-5 w-5"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Close"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Panel"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Modal.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})}),`
`,l(n.h2,{id:"examples",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#examples",children:l(n.span,{class:"icon icon-link"})}),"Examples"]}),`
`,l(C,{})]})},"_createMdxContent_0",[]));function D(e,n,o){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/modal/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const b=(e={})=>{const n=c(t,{children:c(A,e,3,null)},3,"EmOuy7aS");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{b as default,g as frontmatter,f as head,u as headings};
