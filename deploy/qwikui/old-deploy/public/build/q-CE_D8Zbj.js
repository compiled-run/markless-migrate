import{t as r,N as a,z as o,O as t,S as l,U as i,D as c}from"./q-CsvfasCP.js";import{u as p}from"./q-D_NppxYb.js";import{s as d}from"./q-BnEU7A_-.js";import{_ as h}from"./q-BKZ00VYc.js";const y=r(a(()=>h(()=>import("./q-K4N-xGj_.js"),[]),"s_od3G7LusEtI")),m=[{text:"Select",id:"select",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3}],u={title:"Qwik UI | Styled Select Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},f={title:"Qwik UI | Styled Select Component"},C=r(i(n=>{const e={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...p(),...n.components},{StatusBanner:s}=e;return s||A("StatusBanner"),l(c,{children:[l(s,{status:d.styled.Select}),`
`,l(e.h1,{id:"select",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#select",children:l(e.span,{class:"icon icon-link"})}),"Select"]}),`
`,l(e.p,{children:"Displays a list of options for the user to pick from — triggered by a button."}),`
`,l(y,{}),`
`,l(e.h2,{id:"installation",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:l(e.span,{class:"icon icon-link"})}),"Installation"]}),`
`,l(e.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[l(e.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:l(e.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,l(c,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"qwik-ui add select",children:l(e.code,{children:l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"qwik-ui"}),l(e.span,{style:{color:"#ADD7FF"},children:" add"}),l(e.span,{style:{color:"#ADD7FF"},children:" select"})]})})})}),`
`,l(c,{children:l(e.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { type PropsOf, Slot, component$ } from '@builder.io/qwik';
import { Select as HeadlessSelect } from '@qwik-ui/headless';
import { cn } from '@qwik-ui/utils';
import { LuCheck, LuChevronDown } from '@qwikest/icons/lucide';

const Root = (props: PropsOf<typeof HeadlessSelect.Root>) => (
  <HeadlessSelect.Root
    {...props}
    selectItemComponent={Item}
    selectItemLabelComponent={ItemLabel}
    selectErrorMessageComponent={ErrorMessage}
  />
);

const Label = component$<PropsOf<typeof HeadlessSelect.Label>>(({ ...props }) => {
  return (
    <>
      <HeadlessSelect.Label
        {...props}
        class={cn('px-2 py-1.5 text-sm font-semibold', props.class)}
      >
        <Slot />
      </HeadlessSelect.Label>
    </>
  );
});

const Trigger = component$<PropsOf<typeof HeadlessSelect.Trigger>>(({ ...props }) => {
  return (
    <>
      <HeadlessSelect.Trigger
        {...props}
        class={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-sm ring-offset-background placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
          props.class,
        )}
      >
        <Slot />
        <LuChevronDown class="h-4 w-4 opacity-50" />
      </HeadlessSelect.Trigger>
    </>
  );
});

const DisplayValue = HeadlessSelect.DisplayValue;

const Popover = component$<PropsOf<typeof HeadlessSelect.Popover>>(({ ...props }) => {
  return (
    <>
      <HeadlessSelect.Popover
        {...props}
        class={cn(
          'w-full max-w-60 min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-closing:animate-out data-closing:fade-out-0 data-closing:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          props.class,
        )}
      >
        <Slot />
      </HeadlessSelect.Popover>
    </>
  );
});

const Group = HeadlessSelect.Group;

const GroupLabel = HeadlessSelect.GroupLabel;

const ErrorMessage = HeadlessSelect.ErrorMessage;

const Item = component$<PropsOf<typeof HeadlessSelect.Item>>(({ ...props }) => {
  return (
    <HeadlessSelect.Item
      {...props}
      class={cn(
        'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        'data-highlighted:border-base data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        props.class,
      )}
    >
      <Slot />
    </HeadlessSelect.Item>
  );
});

const ItemIndicator = component$<PropsOf<typeof HeadlessSelect.ItemIndicator>>(
  ({ ...props }) => {
    return (
      <span class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <HeadlessSelect.ItemIndicator {...props}>
          <LuCheck class="h-4 w-4" />
        </HeadlessSelect.ItemIndicator>
      </span>
    );
  },
);

const ItemLabel = component$<PropsOf<typeof HeadlessSelect.ItemLabel>>(({ ...props }) => {
  return (
    <HeadlessSelect.ItemLabel {...props}>
      <Slot />
    </HeadlessSelect.ItemLabel>
  );
});

export const Select = {
  Root,
  Label,
  Trigger,
  DisplayValue,
  Popover,
  Group,
  GroupLabel,
  Item,
  ItemIndicator,
  ItemLabel,
  ErrorMessage,
};`,children:l(e.code,{children:[l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#A6ACCD"},children:" type"}),l(e.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#ADD7FF"},children:" Slot"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#ADD7FF"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" Select"}),l(e.span,{style:{color:"#A6ACCDC0"},children:" as"}),l(e.span,{style:{color:"#ADD7FF"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" cn"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"import "}),l(e.span,{style:{color:"#A6ACCD"},children:"{"}),l(e.span,{style:{color:"#ADD7FF"},children:" LuCheck"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#ADD7FF"},children:" LuChevronDown"}),l(e.span,{style:{color:"#A6ACCD"},children:" }"}),l(e.span,{style:{color:"#A6ACCD"},children:" from"}),l(e.span,{style:{color:"#A6ACCD"},children:" '"}),l(e.span,{style:{color:"#5DE4C7"},children:"@qwikest/icons/lucide"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#ADD7FF"},children:" Root"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#A6ACCD"},children:" ("}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#91B4D5"},children:":"}),l(e.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Root"}),l(e.span,{style:{color:"#A6ACCD"},children:">) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Root"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    selectItemComponent"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{Item}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    selectItemLabelComponent"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{ItemLabel}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    selectErrorMessageComponent"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{ErrorMessage}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"  />"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Label"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Label"}),l(e.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    <>"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Label"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"        class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#5DE4C7"},children:"px-2 py-1.5 text-sm font-semibold"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","}),l(e.span,{style:{color:"#E4F0FB"},children:" props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:")"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"      >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Label"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    </>"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Trigger"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Trigger"}),l(e.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    <>"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Trigger"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"        class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"          '"}),l(e.span,{style:{color:"#5DE4C7"},children:"flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-sm ring-offset-background placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"          props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"        )"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"      >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        <"}),l(e.span,{style:{color:"#5DE4C7"},children:"LuChevronDown"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"h-4 w-4 opacity-50"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Trigger"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    </>"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" DisplayValue"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"DisplayValue"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Popover"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Popover"}),l(e.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    <>"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Popover"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"        class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"          '"}),l(e.span,{style:{color:"#5DE4C7"},children:"w-full max-w-60 min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-closing:animate-out data-closing:fade-out-0 data-closing:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"          props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"        )"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"      >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Popover"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    </>"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Group"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Group"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" GroupLabel"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"GroupLabel"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" ErrorMessage"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"ErrorMessage"}),l(e.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Item"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"Item"}),l(e.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Item"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#E4F0FB"},children:"{"}),l(e.span,{style:{color:"#E4F0FBD0"},children:"cn"}),l(e.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"        '"}),l(e.span,{style:{color:"#5DE4C7"},children:"relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"        '"}),l(e.span,{style:{color:"#5DE4C7"},children:"data-highlighted:border-base data-highlighted:bg-accent data-highlighted:text-accent-foreground"}),l(e.span,{style:{color:"#A6ACCD"},children:"'"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        props"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"class"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"      )"}),l(e.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.Item"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" ItemIndicator"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"ItemIndicator"}),l(e.span,{style:{color:"#A6ACCD"},children:">>("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#A6ACCD"},children:"  ({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"    return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"span"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"absolute right-2 flex h-3.5 w-3.5 items-center justify-center"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.ItemIndicator"}),l(e.span,{style:{color:"#E4F0FB"},children:" {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"          <"}),l(e.span,{style:{color:"#5DE4C7"},children:"LuCheck"}),l(e.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" class"}),l(e.span,{style:{color:"#91B4D5"},children:"="}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#5DE4C7"},children:"h-4 w-4"}),l(e.span,{style:{color:"#A6ACCD"},children:'"'}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"        </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.ItemIndicator"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      </"}),l(e.span,{style:{color:"#5DE4C7"},children:"span"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"    );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  },"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:");"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#91B4D5"},children:"const"}),l(e.span,{style:{color:"#E4F0FB"},children:" ItemLabel"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#E4F0FBD0"},children:" component$"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#A6ACCDC0"},children:"PropsOf"}),l(e.span,{style:{color:"#A6ACCD"},children:"<"}),l(e.span,{style:{color:"#91B4D5"},children:"typeof"}),l(e.span,{style:{color:"#E4F0FB"},children:" HeadlessSelect"}),l(e.span,{style:{color:"#A6ACCD"},children:"."}),l(e.span,{style:{color:"#E4F0FB"},children:"ItemLabel"}),l(e.span,{style:{color:"#A6ACCD"},children:">>(({ "}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props"}),l(e.span,{style:{color:"#A6ACCD"},children:" }) "}),l(e.span,{style:{color:"#91B4D5"},children:"=>"}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7C0"},children:"  return"}),l(e.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    <"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.ItemLabel"}),l(e.span,{style:{color:"#E4F0FB"},children:" {"}),l(e.span,{style:{color:"#91B4D5"},children:"..."}),l(e.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"      <"}),l(e.span,{style:{color:"#5DE4C7"},children:"Slot"}),l(e.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"    </"}),l(e.span,{style:{color:"#5DE4C7"},children:"HeadlessSelect.ItemLabel"}),l(e.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,l(e.span,{class:"line"}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#5DE4C7"},children:"export"}),l(e.span,{style:{color:"#91B4D5"},children:" const"}),l(e.span,{style:{color:"#E4F0FB"},children:" Select"}),l(e.span,{style:{color:"#91B4D5"},children:" ="}),l(e.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Root"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Label"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Trigger"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  DisplayValue"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Popover"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Group"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  GroupLabel"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  Item"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  ItemIndicator"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  ItemLabel"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:[l(e.span,{style:{color:"#E4F0FB"},children:"  ErrorMessage"}),l(e.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,l(e.span,{class:"line",children:l(e.span,{style:{color:"#A6ACCD"},children:"};"})})]})})})]})},"_createMdxContent_0",[]));function A(n,e,s){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/select/index.mdx: Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}const g=(n={})=>{const e=o(t,{children:o(C,n,3,null)},3,"_crbwt7x");return typeof MDXLayout=="function"?l(MDXLayout,{children:e}):e};export{g as default,f as frontmatter,u as head,m as headings};
