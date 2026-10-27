import{t as r,N as o,z as a,O as t,S as n,U as d,D as i}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as s}from"./q-BKZ00VYc.js";const y=r(o(()=>s(()=>import("./q-BBzjUeaG.js"),[]),"s_YzOEmF0tzAA")),C=r(o(()=>s(()=>import("./q-DlmPgX9p.js"),[]),"s_X58762w0rdk")),A=r(o(()=>s(()=>import("./q-DGoyzbSn.js"),[]),"s_sih24jc6UA8")),D=r(o(()=>s(()=>import("./q-A3UFaxSs.js"),[]),"s_4oxxyIy88sM")),E=[{text:"Badge",id:"badge",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3},{text:"Examples",id:"examples",level:2},{text:"Primary",id:"primary",level:3},{text:"Secondary",id:"secondary",level:3},{text:"Alert",id:"alert",level:3},{text:"Outline",id:"outline",level:3}],B={title:"Qwik UI | Styled Badge Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},b={title:"Qwik UI | Styled Badge Component"},m=r(d(e=>{const l={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...p(),...e.components},{StatusBanner:c}=l;return c||u("StatusBanner"),n(i,{children:[n(c,{status:h.styled.Badge}),`
`,n(l.h1,{id:"badge",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#badge",children:n(l.span,{class:"icon icon-link"})}),"Badge"]}),`
`,n(l.p,{children:"Displays a badge or a component that looks like a badge."}),`
`,n(l.h2,{id:"installation",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:n(l.span,{class:"icon icon-link"})}),"Installation"]}),`
`,n(l.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:n(l.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,n(i,{children:n(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add badge",children:n(l.code,{children:n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),n(l.span,{style:{color:"#ADD7FF"},children:" add"}),n(l.span,{style:{color:"#ADD7FF"},children:" badge"})]})})})}),`
`,n(i,{children:n(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, type PropsOf, Slot } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-semibold shadow-sm transition-colors focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden',
  {
    variants: {
      look: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        alert: 'bg-alert text-alert-foreground hover:bg-alert/80',
        outline: 'border text-foreground',
      },
    },
    defaultVariants: {
      look: 'primary',
    },
  },
);

type BadgeProps = PropsOf<'div'> & VariantProps<typeof badgeVariants>;

export const Badge = component$<BadgeProps>(({ look, ...props }) => {
  return (
    <div {...props} class={cn(badgeVariants({ look }), props.class)}>
      <Slot />
    </div>
  );
});`,children:n(l.code,{children:[n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#A6ACCD"},children:" type"}),n(l.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#ADD7FF"},children:" Slot"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" cn"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" cva"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#A6ACCD"},children:" type"}),n(l.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"export"}),n(l.span,{style:{color:"#91B4D5"},children:" const"}),n(l.span,{style:{color:"#E4F0FB"},children:" badgeVariants"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" cva"}),n(l.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  '"}),n(l.span,{style:{color:"#5DE4C7"},children:"inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-semibold shadow-sm transition-colors focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"    variants"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      look"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"        primary"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"bg-primary text-primary-foreground hover:bg-primary/80"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"        secondary"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"bg-secondary text-secondary-foreground hover:bg-secondary/80"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"        alert"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"bg-alert text-alert-foreground hover:bg-alert/80"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"        outline"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"border text-foreground"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"    defaultVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      look"}),n(l.span,{style:{color:"#A6ACCD"},children:":"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"primary"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" BadgeProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"div"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:">"}),n(l.span,{style:{color:"#91B4D5"},children:" &"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" VariantProps"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" badgeVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"export"}),n(l.span,{style:{color:"#91B4D5"},children:" const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Badge"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#A6ACCDC0"},children:"BadgeProps"}),n(l.span,{style:{color:"#A6ACCD"},children:">(({ "}),n(l.span,{style:{color:"#E4F0FB"},children:"look"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#A6ACCD"},children:" }) "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"div"}),n(l.span,{style:{color:"#E4F0FB"},children:" {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props} "}),n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("}),n(l.span,{style:{color:"#E4F0FBD0"},children:"badgeVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:"({"}),n(l.span,{style:{color:"#E4F0FB"},children:" look"}),n(l.span,{style:{color:"#A6ACCD"},children:" }),"}),n(l.span,{style:{color:"#E4F0FB"},children:" props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:")"}),n(l.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"div"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,n(l.h2,{id:"examples",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#examples",children:n(l.span,{class:"icon icon-link"})}),"Examples"]}),`
`,n(l.h3,{id:"primary",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#primary",children:n(l.span,{class:"icon icon-link"})}),"Primary"]}),`
`,n(y,{}),`
`,n(l.h3,{id:"secondary",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#secondary",children:n(l.span,{class:"icon icon-link"})}),"Secondary"]}),`
`,n(C,{}),`
`,n(l.h3,{id:"alert",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#alert",children:n(l.span,{class:"icon icon-link"})}),"Alert"]}),`
`,n(A,{}),`
`,n(l.h3,{id:"outline",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#outline",children:n(l.span,{class:"icon icon-link"})}),"Outline"]}),`
`,n(D,{})]})},"_createMdxContent_0",[]));function u(e,l,c){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/badge/index.mdx: Expected component `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}const k=(e={})=>{const l=a(t,{children:a(m,e,3,null)},3,"MgmsxHAr");return typeof MDXLayout=="function"?n(MDXLayout,{children:l}):l};export{k as default,b as frontmatter,B as head,E as headings};
