import{t as l,N as s,z as t,O as a,S as n,U as d,D as i}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as r}from"./q-BKZ00VYc.js";const C=l(s(()=>r(()=>import("./q-BRX_9Ouw.js"),[]),"s_eQc2LHYGW5E")),A=l(s(()=>r(()=>import("./q-DusjAya3.js"),[]),"s_JdaqIIGNmqA")),y=l(s(()=>r(()=>import("./q-CuFO_nEE.js"),[]),"s_MLIng4I005o")),D=l(s(()=>r(()=>import("./q-Riv_14Li.js"),[]),"s_kWMbsIQpbOA")),u=l(s(()=>r(()=>import("./q-ma0nxNYy.js"),[]),"s_nPmShRtBfVc")),m=l(s(()=>r(()=>import("./q-9KajzNC2.js"),[]),"s_TZJJOjFIk6Y")),b=l(s(()=>r(()=>import("./q-Ce2zkvZI.js"),[]),"s_FUr4H81XDf8")),F=l(s(()=>r(()=>import("./q-D7dos3Ct.js"),[]),"s_Jd10sotRLaQ")),v=l(s(()=>r(()=>import("./q-Da5mVMd9.js"),[]),"s_1W0Th3vGeDE")),f=l(s(()=>r(()=>import("./q-CTpxtSTG.js"),[]),"s_KPHlvppXw94")),w=[{text:"Button",id:"button",level:1},{text:"Installation",id:"installation",level:2},{text:"Examples",id:"examples",level:2},{text:"Primary",id:"primary",level:3},{text:"Secondary",id:"secondary",level:3},{text:"Alert",id:"alert",level:3},{text:"Outline",id:"outline",level:3},{text:"Ghost",id:"ghost",level:3},{text:"Link",id:"link",level:3},{text:"Large and Small",id:"large-and-small",level:3},{text:"Icon",id:"icon",level:3},{text:"With Icon",id:"with-icon",level:3},{text:"Loading",id:"loading",level:3}],S={title:"Qwik UI | Styled Button Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},P={title:"Qwik UI | Styled Button Component"},g=l(d(o=>{const e={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",strong:"strong",...p(),...o.components},{StatusBanner:c}=e;return c||x("StatusBanner"),n(i,{children:[n(c,{status:h.styled.Button}),`
`,n(e.h1,{id:"button",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#button",children:n(e.span,{class:"icon icon-link"})}),"Button"]}),`
`,n(e.p,{children:"Displays a button or a component that looks like a button."}),`
`,n(e.h2,{id:"installation",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:n(e.span,{class:"icon icon-link"})}),"Installation"]}),`
`,n(e.p,{children:n(e.strong,{children:"Run the following cli command or copy/paste the component code into your project"})}),`
`,n(i,{children:n(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add button",children:n(e.code,{children:n(e.span,{class:"line",children:[n(e.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),n(e.span,{style:{color:"#ADD7FF"},children:" add"}),n(e.span,{style:{color:"#ADD7FF"},children:" button"})]})})})}),`
`,n(i,{children:n(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, type PropsOf, Slot } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'group inline-flex items-center justify-center rounded-sm text-sm font-medium transition-all duration-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      look: {
        primary:
          'border-base bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:press active:shadow-base',
        secondary:
          'border-base bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 active:press active:shadow-base',
        alert:
          'border-base bg-alert text-alert-foreground shadow-sm hover:bg-alert/90 active:press active:shadow-base',
        outline:
          'border bg-background text-foreground shadow-sm hover:bg-accent active:press active:shadow-base',
        ghost: 'text-accent-foreground hover:bg-accent',
        link: 'text-foreground hover:bg-transparent hover:text-foreground/80 hover:underline hover:underline-offset-2',
      },
      size: {
        sm: 'h-8 px-2 py-1.5 text-sm',
        md: 'h-12 px-4 py-3 text-base',
        lg: 'h-16 px-8 py-4 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      look: 'primary',
      size: 'md',
    },
  },
);

type ButtonProps = PropsOf<'button'> & VariantProps<typeof buttonVariants>;

export const Button = component$<ButtonProps>(({ size, look, ...props }) => {
  return (
    <button {...props} class={cn(buttonVariants({ size, look }), props.class)}>
      <Slot />
    </button>
  );
});`,children:n(e.code,{children:[n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7"},children:"import "}),n(e.span,{style:{color:"#A6ACCD"},children:"{"}),n(e.span,{style:{color:"#ADD7FF"},children:" component$"}),n(e.span,{style:{color:"#A6ACCD"},children:","}),n(e.span,{style:{color:"#A6ACCD"},children:" type"}),n(e.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),n(e.span,{style:{color:"#A6ACCD"},children:","}),n(e.span,{style:{color:"#ADD7FF"},children:" Slot"}),n(e.span,{style:{color:"#A6ACCD"},children:" }"}),n(e.span,{style:{color:"#A6ACCD"},children:" from"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7"},children:"import "}),n(e.span,{style:{color:"#A6ACCD"},children:"{"}),n(e.span,{style:{color:"#ADD7FF"},children:" cn"}),n(e.span,{style:{color:"#A6ACCD"},children:" }"}),n(e.span,{style:{color:"#A6ACCD"},children:" from"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7"},children:"import "}),n(e.span,{style:{color:"#A6ACCD"},children:"{"}),n(e.span,{style:{color:"#ADD7FF"},children:" cva"}),n(e.span,{style:{color:"#A6ACCD"},children:","}),n(e.span,{style:{color:"#A6ACCD"},children:" type"}),n(e.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),n(e.span,{style:{color:"#A6ACCD"},children:" }"}),n(e.span,{style:{color:"#A6ACCD"},children:" from"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(e.span,{class:"line"}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7"},children:"export"}),n(e.span,{style:{color:"#91B4D5"},children:" const"}),n(e.span,{style:{color:"#E4F0FB"},children:" buttonVariants"}),n(e.span,{style:{color:"#91B4D5"},children:" ="}),n(e.span,{style:{color:"#E4F0FBD0"},children:" cva"}),n(e.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#A6ACCD"},children:"  '"}),n(e.span,{style:{color:"#5DE4C7"},children:"group inline-flex items-center justify-center rounded-sm text-sm font-medium transition-all duration-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"  {"})}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"    variants"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"      look"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        primary"}),n(e.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#A6ACCD"},children:"          '"}),n(e.span,{style:{color:"#5DE4C7"},children:"border-base bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:press active:shadow-base"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        secondary"}),n(e.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#A6ACCD"},children:"          '"}),n(e.span,{style:{color:"#5DE4C7"},children:"border-base bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 active:press active:shadow-base"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        alert"}),n(e.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#A6ACCD"},children:"          '"}),n(e.span,{style:{color:"#5DE4C7"},children:"border-base bg-alert text-alert-foreground shadow-sm hover:bg-alert/90 active:press active:shadow-base"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        outline"}),n(e.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#A6ACCD"},children:"          '"}),n(e.span,{style:{color:"#5DE4C7"},children:"border bg-background text-foreground shadow-sm hover:bg-accent active:press active:shadow-base"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        ghost"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"text-accent-foreground hover:bg-accent"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        link"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"text-foreground hover:bg-transparent hover:text-foreground/80 hover:underline hover:underline-offset-2"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"      size"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        sm"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"h-8 px-2 py-1.5 text-sm"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        md"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"h-12 px-4 py-3 text-base"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        lg"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"h-16 px-8 py-4 text-lg"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"        icon"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"h-10 w-10"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"    defaultVariants"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"      look"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"primary"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#ADD7FF"},children:"      size"}),n(e.span,{style:{color:"#A6ACCD"},children:":"}),n(e.span,{style:{color:"#A6ACCD"},children:" '"}),n(e.span,{style:{color:"#5DE4C7"},children:"md"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,n(e.span,{class:"line"}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#91B4D5"},children:"type"}),n(e.span,{style:{color:"#A6ACCD"},children:" ButtonProps"}),n(e.span,{style:{color:"#91B4D5"},children:" ="}),n(e.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(e.span,{style:{color:"#A6ACCD"},children:"<"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#5DE4C7"},children:"button"}),n(e.span,{style:{color:"#A6ACCD"},children:"'"}),n(e.span,{style:{color:"#A6ACCD"},children:">"}),n(e.span,{style:{color:"#91B4D5"},children:" &"}),n(e.span,{style:{color:"#A6ACCDC0"},children:" VariantProps"}),n(e.span,{style:{color:"#A6ACCD"},children:"<"}),n(e.span,{style:{color:"#91B4D5"},children:"typeof"}),n(e.span,{style:{color:"#E4F0FB"},children:" buttonVariants"}),n(e.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(e.span,{class:"line"}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7"},children:"export"}),n(e.span,{style:{color:"#91B4D5"},children:" const"}),n(e.span,{style:{color:"#E4F0FB"},children:" Button"}),n(e.span,{style:{color:"#91B4D5"},children:" ="}),n(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(e.span,{style:{color:"#A6ACCD"},children:"<"}),n(e.span,{style:{color:"#A6ACCDC0"},children:"ButtonProps"}),n(e.span,{style:{color:"#A6ACCD"},children:">(({ "}),n(e.span,{style:{color:"#E4F0FB"},children:"size"}),n(e.span,{style:{color:"#A6ACCD"},children:", "}),n(e.span,{style:{color:"#E4F0FB"},children:"look"}),n(e.span,{style:{color:"#A6ACCD"},children:", "}),n(e.span,{style:{color:"#91B4D5"},children:"..."}),n(e.span,{style:{color:"#E4F0FB"},children:"props"}),n(e.span,{style:{color:"#A6ACCD"},children:" }) "}),n(e.span,{style:{color:"#91B4D5"},children:"=>"}),n(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#E4F0FB"},children:"    <"}),n(e.span,{style:{color:"#5DE4C7"},children:"button"}),n(e.span,{style:{color:"#E4F0FB"},children:" {"}),n(e.span,{style:{color:"#91B4D5"},children:"..."}),n(e.span,{style:{color:"#E4F0FB"},children:"props} "}),n(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),n(e.span,{style:{color:"#91B4D5"},children:"="}),n(e.span,{style:{color:"#E4F0FB"},children:"{"}),n(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(e.span,{style:{color:"#A6ACCD"},children:"("}),n(e.span,{style:{color:"#E4F0FBD0"},children:"buttonVariants"}),n(e.span,{style:{color:"#A6ACCD"},children:"({"}),n(e.span,{style:{color:"#E4F0FB"},children:" size"}),n(e.span,{style:{color:"#A6ACCD"},children:","}),n(e.span,{style:{color:"#E4F0FB"},children:" look"}),n(e.span,{style:{color:"#A6ACCD"},children:" }),"}),n(e.span,{style:{color:"#E4F0FB"},children:" props"}),n(e.span,{style:{color:"#A6ACCD"},children:"."}),n(e.span,{style:{color:"#E4F0FB"},children:"class"}),n(e.span,{style:{color:"#A6ACCD"},children:")"}),n(e.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#E4F0FB"},children:"      <"}),n(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(e.span,{class:"line",children:[n(e.span,{style:{color:"#E4F0FB"},children:"    </"}),n(e.span,{style:{color:"#5DE4C7"},children:"button"}),n(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(e.span,{class:"line",children:n(e.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,n(e.h2,{id:"examples",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#examples",children:n(e.span,{class:"icon icon-link"})}),"Examples"]}),`
`,n(e.h3,{id:"primary",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#primary",children:n(e.span,{class:"icon icon-link"})}),"Primary"]}),`
`,n(C,{}),`
`,n(e.h3,{id:"secondary",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#secondary",children:n(e.span,{class:"icon icon-link"})}),"Secondary"]}),`
`,n(A,{}),`
`,n(e.h3,{id:"alert",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#alert",children:n(e.span,{class:"icon icon-link"})}),"Alert"]}),`
`,n(y,{}),`
`,n(e.h3,{id:"outline",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#outline",children:n(e.span,{class:"icon icon-link"})}),"Outline"]}),`
`,n(D,{}),`
`,n(e.h3,{id:"ghost",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#ghost",children:n(e.span,{class:"icon icon-link"})}),"Ghost"]}),`
`,n(u,{}),`
`,n(e.h3,{id:"link",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#link",children:n(e.span,{class:"icon icon-link"})}),"Link"]}),`
`,n(m,{}),`
`,n(e.h3,{id:"large-and-small",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#large-and-small",children:n(e.span,{class:"icon icon-link"})}),"Large and Small"]}),`
`,n(b,{}),`
`,n(e.h3,{id:"icon",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#icon",children:n(e.span,{class:"icon icon-link"})}),"Icon"]}),`
`,n(F,{}),`
`,n(e.h3,{id:"with-icon",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#with-icon",children:n(e.span,{class:"icon icon-link"})}),"With Icon"]}),`
`,n(v,{}),`
`,n(e.h3,{id:"loading",children:[n(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#loading",children:n(e.span,{class:"icon icon-link"})}),"Loading"]}),`
`,n(f,{})]})},"_createMdxContent_0",[]));function x(o,e,c){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/button/index.mdx: Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}const I=(o={})=>{const e=t(a,{children:t(g,o,3,null)},3,"v9zCGvMo");return typeof MDXLayout=="function"?n(MDXLayout,{children:e}):e};export{I as default,P as frontmatter,S as head,w as headings};
