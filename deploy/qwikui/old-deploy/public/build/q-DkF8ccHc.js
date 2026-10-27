import{t as n,N as r,z as a,O as t,S as e,U as d,D as o}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as h}from"./q-BnEU7A_-.js";import{_ as c}from"./q-BKZ00VYc.js";const C=n(r(()=>c(()=>import("./q-CUWzRVmf.js"),[]),"s_SIzaF6Vt0s8")),A=n(r(()=>c(()=>import("./q-C0gbTArV.js"),[]),"s_wahnslDvKOg")),y=n(r(()=>c(()=>import("./q-Bk2-90SK.js"),[]),"s_9d2508ZiSHA")),D=n(r(()=>c(()=>import("./q-CEDizPPX.js"),[]),"s_EIrb4OjNXL8")),g=n(r(()=>c(()=>import("./q-BYGSbj_P.js"),[]),"s_WKv8ZwbdmGg")),v=[{text:"Toggle",id:"toggle",level:1},{text:"Installation",id:"installation",level:2},{text:"Usage",id:"usage",level:2},{text:"Usage / Component State",id:"usage--component-state",level:2},{text:"Initial Value (Uncontrolled)",id:"initial-value-uncontrolled",level:3},{text:"Reactive Value (Controlled)",id:"reactive-value-controlled",level:3},{text:"Disabled",id:"disabled",level:3}],B={title:"Qwik UI | Styled Toggle Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},k={title:"Qwik UI | Styled Toggle Component"},u=n(d(s=>{const l={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",strong:"strong",...p(),...s.components},{StatusBanner:i}=l;return i||F("StatusBanner"),e(o,{children:[e(i,{status:h.styled.Toggle}),`
`,e(l.h1,{id:"toggle",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#toggle",children:e(l.span,{class:"icon icon-link"})}),"Toggle"]}),`
`,e(l.p,{children:"A two-state button that can be either on or off."}),`
`,e(C,{}),`
`,e(l.p,{children:"In a world of endless choices, sometimes you just need a simple yes or no. The Qwik UI Styled Toggle component is a welcomed rest for the mind."}),`
`,e(l.h2,{id:"installation",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:e(l.span,{class:"icon icon-link"})}),"Installation"]}),`
`,e(l.p,{children:e(l.strong,{children:"Run the following cli command or copy/paste the component code into your project"})}),`
`,e(o,{children:e(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add toggle",children:e(l.code,{children:e(l.span,{class:"line",children:[e(l.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),e(l.span,{style:{color:"#ADD7FF"},children:" add"}),e(l.span,{style:{color:"#ADD7FF"},children:" toggle"})]})})})}),`
`,e(o,{children:e(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, type PropsOf, Slot } from '@builder.io/qwik';
import { cn } from '@qwik-ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as HeadlessToggle } from '@qwik-ui/headless';

export const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-primary aria-pressed:text-primary-foreground',
  {
    variants: {
      look: {
        default: 'border border-input bg-transparent',
        outline:
          'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
      },

      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      look: 'default',
      size: 'default',
    },
  },
);

type ToggleProps = PropsOf<typeof HeadlessToggle> & VariantProps<typeof toggleVariants>;

export const Toggle = component$<ToggleProps>(({ size, look, ...props }) => {
  return (
    <HeadlessToggle {...props} class={cn(toggleVariants({ size, look }), props.class)}>
      <Slot />
    </HeadlessToggle>
  );
});`,children:e(l.code,{children:[e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"import "}),e(l.span,{style:{color:"#A6ACCD"},children:"{"}),e(l.span,{style:{color:"#ADD7FF"},children:" component$"}),e(l.span,{style:{color:"#A6ACCD"},children:","}),e(l.span,{style:{color:"#A6ACCD"},children:" type"}),e(l.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),e(l.span,{style:{color:"#A6ACCD"},children:","}),e(l.span,{style:{color:"#ADD7FF"},children:" Slot"}),e(l.span,{style:{color:"#A6ACCD"},children:" }"}),e(l.span,{style:{color:"#A6ACCD"},children:" from"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"import "}),e(l.span,{style:{color:"#A6ACCD"},children:"{"}),e(l.span,{style:{color:"#ADD7FF"},children:" cn"}),e(l.span,{style:{color:"#A6ACCD"},children:" }"}),e(l.span,{style:{color:"#A6ACCD"},children:" from"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"import "}),e(l.span,{style:{color:"#A6ACCD"},children:"{"}),e(l.span,{style:{color:"#ADD7FF"},children:" cva"}),e(l.span,{style:{color:"#A6ACCD"},children:","}),e(l.span,{style:{color:"#A6ACCD"},children:" type"}),e(l.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),e(l.span,{style:{color:"#A6ACCD"},children:" }"}),e(l.span,{style:{color:"#A6ACCD"},children:" from"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"import "}),e(l.span,{style:{color:"#A6ACCD"},children:"{"}),e(l.span,{style:{color:"#ADD7FF"},children:" Toggle"}),e(l.span,{style:{color:"#A6ACCDC0"},children:" as"}),e(l.span,{style:{color:"#ADD7FF"},children:" HeadlessToggle"}),e(l.span,{style:{color:"#A6ACCD"},children:" }"}),e(l.span,{style:{color:"#A6ACCD"},children:" from"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(l.span,{class:"line"}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"export"}),e(l.span,{style:{color:"#91B4D5"},children:" const"}),e(l.span,{style:{color:"#E4F0FB"},children:" toggleVariants"}),e(l.span,{style:{color:"#91B4D5"},children:" ="}),e(l.span,{style:{color:"#E4F0FBD0"},children:" cva"}),e(l.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#A6ACCD"},children:"  '"}),e(l.span,{style:{color:"#5DE4C7"},children:"inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-primary aria-pressed:text-primary-foreground"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"  {"})}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"    variants"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"      look"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"        default"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"border border-input bg-transparent"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"        outline"}),e(l.span,{style:{color:"#A6ACCD"},children:":"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#A6ACCD"},children:"          '"}),e(l.span,{style:{color:"#5DE4C7"},children:"border border-input bg-transparent hover:bg-accent hover:text-accent-foreground"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,e(l.span,{class:"line"}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"      size"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"        default"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"h-10 px-3"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"        sm"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"h-9 px-2.5"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"        lg"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"h-11 px-5"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"      },"})}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"    defaultVariants"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"      look"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"default"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#ADD7FF"},children:"      size"}),e(l.span,{style:{color:"#A6ACCD"},children:":"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"default"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"    },"})}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,e(l.span,{class:"line"}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#91B4D5"},children:"type"}),e(l.span,{style:{color:"#A6ACCD"},children:" ToggleProps"}),e(l.span,{style:{color:"#91B4D5"},children:" ="}),e(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),e(l.span,{style:{color:"#A6ACCD"},children:"<"}),e(l.span,{style:{color:"#91B4D5"},children:"typeof"}),e(l.span,{style:{color:"#E4F0FB"},children:" HeadlessToggle"}),e(l.span,{style:{color:"#A6ACCD"},children:">"}),e(l.span,{style:{color:"#91B4D5"},children:" &"}),e(l.span,{style:{color:"#A6ACCDC0"},children:" VariantProps"}),e(l.span,{style:{color:"#A6ACCD"},children:"<"}),e(l.span,{style:{color:"#91B4D5"},children:"typeof"}),e(l.span,{style:{color:"#E4F0FB"},children:" toggleVariants"}),e(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,e(l.span,{class:"line"}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"export"}),e(l.span,{style:{color:"#91B4D5"},children:" const"}),e(l.span,{style:{color:"#E4F0FB"},children:" Toggle"}),e(l.span,{style:{color:"#91B4D5"},children:" ="}),e(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),e(l.span,{style:{color:"#A6ACCD"},children:"<"}),e(l.span,{style:{color:"#A6ACCDC0"},children:"ToggleProps"}),e(l.span,{style:{color:"#A6ACCD"},children:">(({ "}),e(l.span,{style:{color:"#E4F0FB"},children:"size"}),e(l.span,{style:{color:"#A6ACCD"},children:", "}),e(l.span,{style:{color:"#E4F0FB"},children:"look"}),e(l.span,{style:{color:"#A6ACCD"},children:", "}),e(l.span,{style:{color:"#91B4D5"},children:"..."}),e(l.span,{style:{color:"#E4F0FB"},children:"props"}),e(l.span,{style:{color:"#A6ACCD"},children:" }) "}),e(l.span,{style:{color:"#91B4D5"},children:"=>"}),e(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#E4F0FB"},children:"    <"}),e(l.span,{style:{color:"#5DE4C7"},children:"HeadlessToggle"}),e(l.span,{style:{color:"#E4F0FB"},children:" {"}),e(l.span,{style:{color:"#91B4D5"},children:"..."}),e(l.span,{style:{color:"#E4F0FB"},children:"props} "}),e(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),e(l.span,{style:{color:"#91B4D5"},children:"="}),e(l.span,{style:{color:"#E4F0FB"},children:"{"}),e(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),e(l.span,{style:{color:"#A6ACCD"},children:"("}),e(l.span,{style:{color:"#E4F0FBD0"},children:"toggleVariants"}),e(l.span,{style:{color:"#A6ACCD"},children:"({"}),e(l.span,{style:{color:"#E4F0FB"},children:" size"}),e(l.span,{style:{color:"#A6ACCD"},children:","}),e(l.span,{style:{color:"#E4F0FB"},children:" look"}),e(l.span,{style:{color:"#A6ACCD"},children:" }),"}),e(l.span,{style:{color:"#E4F0FB"},children:" props"}),e(l.span,{style:{color:"#A6ACCD"},children:"."}),e(l.span,{style:{color:"#E4F0FB"},children:"class"}),e(l.span,{style:{color:"#A6ACCD"},children:")"}),e(l.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#E4F0FB"},children:"      <"}),e(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),e(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,e(l.span,{class:"line",children:[e(l.span,{style:{color:"#E4F0FB"},children:"    </"}),e(l.span,{style:{color:"#5DE4C7"},children:"HeadlessToggle"}),e(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,e(l.span,{class:"line",children:e(l.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(l.h2,{id:"usage",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage",children:e(l.span,{class:"icon icon-link"})}),"Usage"]}),`
`,e(o,{children:e(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"import { Toggle } from '~/components/ui';",children:e(l.code,{children:e(l.span,{class:"line",children:[e(l.span,{style:{color:"#5DE4C7"},children:"import "}),e(l.span,{style:{color:"#A6ACCD"},children:"{"}),e(l.span,{style:{color:"#ADD7FF"},children:" Toggle"}),e(l.span,{style:{color:"#A6ACCD"},children:" }"}),e(l.span,{style:{color:"#A6ACCD"},children:" from"}),e(l.span,{style:{color:"#A6ACCD"},children:" '"}),e(l.span,{style:{color:"#5DE4C7"},children:"~/components/ui"}),e(l.span,{style:{color:"#A6ACCD"},children:"'"}),e(l.span,{style:{color:"#A6ACCD"},children:";"})]})})})}),`
`,e(o,{children:e(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"<Toggle>Hello</Toggle",children:e(l.code,{children:e(l.span,{class:"line",children:[e(l.span,{style:{color:"#E4F0FB"},children:"<"}),e(l.span,{style:{color:"#5DE4C7"},children:"Toggle"}),e(l.span,{style:{color:"#E4F0FB"},children:">Hello</Toggle"})]})})})}),`
`,e(l.h2,{id:"usage--component-state",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#usage--component-state",children:e(l.span,{class:"icon icon-link"})}),"Usage / Component State"]}),`
`,e(l.h3,{id:"initial-value-uncontrolled",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#initial-value-uncontrolled",children:e(l.span,{class:"icon icon-link"})}),"Initial Value (Uncontrolled)"]}),`
`,e(l.p,{children:["An initial, uncontrolled value can be provided using the ",e(l.code,{children:"pressed"})," prop."]}),`
`,e(A,{}),`
`,e(l.p,{children:[`If you want to have some control when the toggle is pressed, like making some side effect you can use
the `,e(l.code,{children:"onPressedChange$"}),". The event is fired when the user toggle the button, and receives the new value."]}),`
`,e(y,{}),`
`,e(l.h3,{id:"reactive-value-controlled",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#reactive-value-controlled",children:e(l.span,{class:"icon icon-link"})}),"Reactive Value (Controlled)"]}),`
`,e(l.p,{children:["Pass a signal to ",e(l.code,{children:"bind:value"})," prop to make the pressed state controlled (binding the value with a signal)."]}),`
`,e(D,{}),`
`,e(l.h3,{id:"disabled",children:[e(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#disabled",children:e(l.span,{class:"icon icon-link"})}),"Disabled"]}),`
`,e(l.p,{children:["Pass the ",e(l.code,{children:"disabled"})," prop."]}),`
`,e(g,{})]})},"_createMdxContent_0",[]));function F(s,l,i){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/toggle/index.mdx: Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}const x=(s={})=>{const l=a(t,{children:a(u,s,3,null)},3,"r8VIW84k");return typeof MDXLayout=="function"?e(MDXLayout,{children:l}):l};export{x as default,k as frontmatter,B as head,v as headings};
