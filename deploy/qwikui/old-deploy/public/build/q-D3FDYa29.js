import{t as r,N as c,z as i,O as t,S as l,U as p,D as s}from"./q-CsvfasCP.js";import{u as d}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as a}from"./q-BKZ00VYc.js";const y=r(c(()=>a(()=>import("./q-DwFVsKve.js"),[]),"s_VvmkrEltdL4")),C=r(c(()=>a(()=>import("./q-DyxSxHCI.js"),[]),"s_GhsgkOSyWr0")),A=r(c(()=>a(()=>import("./q-EshNZJSN.js"),[]),"s_ya3hxhUg4uM")),f=[{text:"Alert",id:"alert",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Usage",id:"usage",level:2},{text:"Examples",id:"examples",level:2},{text:"Alert",id:"alert-1",level:3},{text:"Primary",id:"primary",level:3}],g={title:"Qwik UI | Styled Alert Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},v={title:"Qwik UI | Styled Alert Component"},D=r(p(e=>{const n={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...d(),...e.components},{StatusBanner:o}=n;return o||F("StatusBanner"),l(s,{children:[l(o,{status:h.styled.Alert}),`
`,l(n.h1,{id:"alert",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#alert",children:l(n.span,{class:"icon icon-link"})}),"Alert"]}),`
`,l(n.p,{children:"Displays a callout for user attention."}),`
`,l(y,{}),`
`,l(n.h2,{id:"installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(n.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add alert",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" alert"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, Slot, type PropsOf } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';

import { cva, type VariantProps } from 'class-variance-authority';

export const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:text-foreground [&>svg+div]:translate-y-[-3px] [&>svg~*]:pl-7',
  {
    variants: {
      look: {
        neutral: 'bg-background text-foreground',
        alert: 'border-alert/60 text-alert [&>svg]:text-alert',
        primary: 'border-primary',
        secondary: 'border-secondary',
      },
    },
    defaultVariants: {
      look: 'neutral',
    },
  },
);

type AlertProps = PropsOf<'div'> & VariantProps<typeof alertVariants>;

const Root = component$<AlertProps>(({ look, ...props }) => {
  return (
    <div {...props} role="alert" class={cn(alertVariants({ look }), props.class)}>
      <Slot />
    </div>
  );
});

const Title = component$<PropsOf<'h5'>>(({ ...props }) => {
  return (
    <h5
      {...props}
      class={cn('mb-1 leading-none font-medium tracking-tight', props.class)}
    >
      <Slot />
    </h5>
  );
});

const Description = component$<PropsOf<'div'>>(({ ...props }) => {
  return (
    <div {...props} class={cn('text-sm [&_p]:leading-relaxed', props.class)}>
      <Slot />
    </div>
  );
});

export const Alert = {
  Root,
  Title,
  Description,
};`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cn"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" cva"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#A6ACCD"},children:" type"}),l(n.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" alertVariants"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" cva"}),l(n.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"  '"}),l(n.span,{style:{color:"#5DE4C7"},children:"relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:text-foreground [&>svg+div]:translate-y-[-3px] [&>svg~*]:pl-7"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"    variants"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"      look"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        neutral"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"bg-background text-foreground"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        alert"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"border-alert/60 text-alert [&>svg]:text-alert"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        primary"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"border-primary"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        secondary"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"border-secondary"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"    defaultVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"      look"}),l(n.span,{style:{color:"#A6ACCD"},children:":"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"neutral"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"type"}),l(n.span,{style:{color:"#A6ACCD"},children:" AlertProps"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">"}),l(n.span,{style:{color:"#91B4D5"},children:" &"}),l(n.span,{style:{color:"#A6ACCDC0"},children:" VariantProps"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#91B4D5"},children:"typeof"}),l(n.span,{style:{color:"#E4F0FB"},children:" alertVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Root"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"AlertProps"}),l(n.span,{style:{color:"#A6ACCD"},children:">(({ "}),l(n.span,{style:{color:"#E4F0FB"},children:"look"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"role"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"alert"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#E4F0FBD0"},children:"alertVariants"}),l(n.span,{style:{color:"#A6ACCD"},children:"({"}),l(n.span,{style:{color:"#E4F0FB"},children:" look"}),l(n.span,{style:{color:"#A6ACCD"},children:" }),"}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Title"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"h5"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"h5"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"mb-1 leading-none font-medium tracking-tight"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"h5"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Description"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(n.span,{style:{color:"#A6ACCD"},children:"<"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props"}),l(n.span,{style:{color:"#A6ACCD"},children:" }) "}),l(n.span,{style:{color:"#91B4D5"},children:"=>"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    <"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:" {"}),l(n.span,{style:{color:"#91B4D5"},children:"..."}),l(n.span,{style:{color:"#E4F0FB"},children:"props} "}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#E4F0FB"},children:"{"}),l(n.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:"("}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"text-sm [&_p]:leading-relaxed"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:","}),l(n.span,{style:{color:"#E4F0FB"},children:" props"}),l(n.span,{style:{color:"#A6ACCD"},children:"."}),l(n.span,{style:{color:"#E4F0FB"},children:"class"}),l(n.span,{style:{color:"#A6ACCD"},children:")"}),l(n.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"      <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"    </"}),l(n.span,{style:{color:"#5DE4C7"},children:"div"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export"}),l(n.span,{style:{color:"#91B4D5"},children:" const"}),l(n.span,{style:{color:"#E4F0FB"},children:" Alert"}),l(n.span,{style:{color:"#91B4D5"},children:" ="}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Title"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  Description"}),l(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"};"})})]})})}),`
`,l(n.h2,{id:"usage",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:l(n.span,{class:"icon icon-link"})}),"Usage"]}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Alert } from '~/components/ui';",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"import "}),l(n.span,{style:{color:"#A6ACCD"},children:"{"}),l(n.span,{style:{color:"#ADD7FF"},children:" Alert"}),l(n.span,{style:{color:"#A6ACCD"},children:" }"}),l(n.span,{style:{color:"#A6ACCD"},children:" from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,l(s,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`<Alert.Root>
  <Terminal class="h-4 w-4" />
  <Alert.Title>Heads up!</Alert.Title>
  <Alert.Description>
    You can add components and dependencies to your app using the cli.
  </Alert.Description>
</Alert.Root>`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"<"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Terminal"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(n.span,{style:{color:"#91B4D5"},children:"="}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"h-4 w-4"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Title"}),l(n.span,{style:{color:"#E4F0FB"},children:">Heads up!</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Title"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  <"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Description"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#E4F0FB"},children:"    You can add components and dependencies to your app using the cli."})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"  </"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Description"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FB"},children:"</"}),l(n.span,{style:{color:"#5DE4C7"},children:"Alert.Root"}),l(n.span,{style:{color:"#E4F0FB"},children:">"})]})]})})}),`
`,l(n.h2,{id:"examples",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#examples",children:l(n.span,{class:"icon icon-link"})}),"Examples"]}),`
`,l(n.h3,{id:"alert-1",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#alert-1",children:l(n.span,{class:"icon icon-link"})}),"Alert"]}),`
`,l(C,{}),`
`,l(n.h3,{id:"primary",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#primary",children:l(n.span,{class:"icon icon-link"})}),"Primary"]}),`
`,l(A,{})]})},"_createMdxContent_0",[]));function F(e,n,o){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/alert/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const x=(e={})=>{const n=i(t,{children:i(D,e,3,null)},3,"u9zAcWFM");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{x as default,v as frontmatter,g as head,f as headings};
