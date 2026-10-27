import{t as c,N as p,z as e,O as a,S as n,U as t,D as r}from"./q-CsvfasCP.js";import{u as i}from"./q-D_NppxYb.js";import{s as d}from"./q-BnEU7A_-.js";import{_ as h}from"./q-BKZ00VYc.js";const y=c(p(()=>h(()=>import("./q-D15CjfNL.js"),[]),"s_yu34PUV1VZE")),m=[{text:"Dropdown",id:"dropdown",level:1},{text:"Installation",id:"installation",level:2},{text:"Run the following cli command or copy/paste the component code into your project",id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",level:3}],u={title:"Qwik UI | Styled Dropdown Component",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},f={title:"Qwik UI | Styled Dropdown Component"},C=c(t(s=>{const l={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...i(),...s.components},{StatusBanner:o}=l;return o||D("StatusBanner"),n(r,{children:[n(o,{status:d.styled.Dropdown}),`
`,n(l.h1,{id:"dropdown",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#dropdown",children:n(l.span,{class:"icon icon-link"})}),"Dropdown"]}),`
`,n(l.p,{children:"A vertically stacked set of interactive headings that each reveal a section of content."}),`
`,n(y,{}),`
`,n(l.h2,{id:"installation",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:n(l.span,{class:"icon icon-link"})}),"Installation"]}),`
`,n(l.h3,{id:"run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#run-the-following-cli-command-or-copypaste-the-component-code-into-your-project",children:n(l.span,{class:"icon icon-link"})}),"Run the following cli command or copy/paste the component code into your project"]}),`
`,n(r,{children:n(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$, PropsOf, Slot } from '@builder.io/qwik';
import { Dropdown as HDropdown } from '@qwik-ui/headless';
import { cn } from '@qwik-ui/utils';
import { buttonVariants } from '../button/button';
import { VariantProps } from 'class-variance-authority';

type RootProps = PropsOf<typeof HDropdown.Root>;

const Root = (props: RootProps) => {
  return (
    <HDropdown.Root dropdownItemComponent={Item} {...props}>
      {props.children}
    </HDropdown.Root>
  );
};

type TriggerProps = PropsOf<typeof HDropdown.Trigger> &
  VariantProps<typeof buttonVariants>;

const Trigger = component$<TriggerProps>(({ size, look, ...props }) => {
  return (
    <HDropdown.Trigger {...props} class={cn(buttonVariants({ size, look }), props.class)}>
      <Slot />
    </HDropdown.Trigger>
  );
});

type PopoverProps = PropsOf<typeof HDropdown.Popover>;

const Popover = component$((props: PopoverProps) => {
  return (
    <HDropdown.Popover
      {...props}
      class={cn(
        'min-w-32 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        props.class,
      )}
    >
      <Slot />
    </HDropdown.Popover>
  );
});

type ItemProps = PropsOf<typeof HDropdown.Item> & {
  inset?: boolean;
};

const Item = component$(({ inset, ...props }: ItemProps) => {
  return (
    <HDropdown.Item
      {...props}
      class={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors select-none',
        'focus:bg-accent focus:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        inset && 'pl-8',
        props.class,
      )}
    >
      <Slot />
    </HDropdown.Item>
  );
});

type ItemIndicatorProps = PropsOf<typeof HDropdown.ItemIndicator>;

const ItemIndicator = component$((props: ItemIndicatorProps) => {
  return (
    <HDropdown.ItemIndicator {...props}>
      <Slot />
    </HDropdown.ItemIndicator>
  );
});

type SeparatorProps = PropsOf<typeof HDropdown.Separator>;

const Separator = component$((props: SeparatorProps) => {
  return (
    <HDropdown.Separator {...props} class={cn('-mx-1 my-1 h-px bg-muted', props.class)} />
  );
});

type GroupProps = PropsOf<typeof HDropdown.Group>;

export const Group = component$((props: GroupProps) => {
  return (
    <HDropdown.Group {...props}>
      <Slot />
    </HDropdown.Group>
  );
});

type GroupLabelProps = PropsOf<typeof HDropdown.GroupLabel> & {
  inset?: boolean;
};

const GroupLabel = component$(({ inset, ...props }: GroupLabelProps) => {
  return (
    <HDropdown.GroupLabel
      {...props}
      class={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', props.class)}
    >
      <Slot />
    </HDropdown.GroupLabel>
  );
});

const Shortcut = component$((props: PropsOf<'span'>) => {
  return (
    <span
      {...props}
      class={cn('ml-auto text-xs tracking-widest opacity-60', props.class)}
    >
      <Slot />
    </span>
  );
});

export const Dropdown = {
  Root,
  Trigger,
  Popover,
  Separator,
  Item,
  ItemIndicator,
  Group,
  GroupLabel,
  Shortcut,
};`,children:n(l.code,{children:[n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#ADD7FF"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#ADD7FF"},children:" Slot"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" Dropdown"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" as"}),n(l.span,{style:{color:"#ADD7FF"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" cn"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/utils"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" buttonVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"../button/button"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"import "}),n(l.span,{style:{color:"#A6ACCD"},children:"{"}),n(l.span,{style:{color:"#ADD7FF"},children:" VariantProps"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#A6ACCD"},children:" from"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"class-variance-authority"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" RootProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Root"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#ADD7FF"},children:" Root"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCD"},children:" ("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" RootProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Root"}),n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:" dropdownItemComponent"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{Item} {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      {props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"children}"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Root"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"};"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" TriggerProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Trigger"}),n(l.span,{style:{color:"#A6ACCD"},children:">"}),n(l.span,{style:{color:"#91B4D5"},children:" &"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCDC0"},children:"  VariantProps"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" buttonVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Trigger"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#A6ACCDC0"},children:"TriggerProps"}),n(l.span,{style:{color:"#A6ACCD"},children:">(({ "}),n(l.span,{style:{color:"#E4F0FB"},children:"size"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#E4F0FB"},children:"look"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#A6ACCD"},children:" }) "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Trigger"}),n(l.span,{style:{color:"#E4F0FB"},children:" {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props} "}),n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("}),n(l.span,{style:{color:"#E4F0FBD0"},children:"buttonVariants"}),n(l.span,{style:{color:"#A6ACCD"},children:"({"}),n(l.span,{style:{color:"#E4F0FB"},children:" size"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#E4F0FB"},children:" look"}),n(l.span,{style:{color:"#A6ACCD"},children:" }),"}),n(l.span,{style:{color:"#E4F0FB"},children:" props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:")"}),n(l.span,{style:{color:"#E4F0FB"},children:"}>"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Trigger"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" PopoverProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Popover"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Popover"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PopoverProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Popover"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"min-w-32 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"        props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"      )"}),n(l.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Popover"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" ItemProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Item"}),n(l.span,{style:{color:"#A6ACCD"},children:">"}),n(l.span,{style:{color:"#91B4D5"},children:" &"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"  inset"}),n(l.span,{style:{color:"#91B4D5"},children:"?:"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" boolean"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"};"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Item"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(({ "}),n(l.span,{style:{color:"#E4F0FB"},children:"inset"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" ItemProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Item"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors select-none"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"focus:bg-accent focus:text-accent-foreground"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"data-disabled:pointer-events-none data-disabled:opacity-50"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"        '"}),n(l.span,{style:{color:"#5DE4C7"},children:"[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"        inset "}),n(l.span,{style:{color:"#91B4D5"},children:"&&"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"pl-8"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"        props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"      )"}),n(l.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Item"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" ItemIndicatorProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"ItemIndicator"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" ItemIndicator"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" ItemIndicatorProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.ItemIndicator"}),n(l.span,{style:{color:"#E4F0FB"},children:" {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.ItemIndicator"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" SeparatorProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Separator"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Separator"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" SeparatorProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Separator"}),n(l.span,{style:{color:"#E4F0FB"},children:" {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props} "}),n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"-mx-1 my-1 h-px bg-muted"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#E4F0FB"},children:" props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:")"}),n(l.span,{style:{color:"#E4F0FB"},children:"} />"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" GroupProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"Group"}),n(l.span,{style:{color:"#A6ACCD"},children:">;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"export"}),n(l.span,{style:{color:"#91B4D5"},children:" const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Group"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" GroupProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Group"}),n(l.span,{style:{color:"#E4F0FB"},children:" {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}>"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.Group"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"type"}),n(l.span,{style:{color:"#A6ACCD"},children:" GroupLabelProps"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#91B4D5"},children:"typeof"}),n(l.span,{style:{color:"#E4F0FB"},children:" HDropdown"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"GroupLabel"}),n(l.span,{style:{color:"#A6ACCD"},children:">"}),n(l.span,{style:{color:"#91B4D5"},children:" &"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"  inset"}),n(l.span,{style:{color:"#91B4D5"},children:"?:"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" boolean"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"};"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" GroupLabel"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(({ "}),n(l.span,{style:{color:"#E4F0FB"},children:"inset"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#A6ACCD"},children:" }"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" GroupLabelProps"}),n(l.span,{style:{color:"#A6ACCD"},children:") "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.GroupLabel"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"px-2 py-1.5 text-sm font-semibold"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#E4F0FB"},children:" inset "}),n(l.span,{style:{color:"#91B4D5"},children:"&&"}),n(l.span,{style:{color:"#A6ACCD"},children:" '"}),n(l.span,{style:{color:"#5DE4C7"},children:"pl-8"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#E4F0FB"},children:" props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:")"}),n(l.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"HDropdown.GroupLabel"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5"},children:"const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Shortcut"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#E4F0FBD0"},children:" component$"}),n(l.span,{style:{color:"#A6ACCD"},children:"(("}),n(l.span,{style:{color:"#E4F0FB"},children:"props"}),n(l.span,{style:{color:"#91B4D5"},children:":"}),n(l.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),n(l.span,{style:{color:"#A6ACCD"},children:"<"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"span"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:">) "}),n(l.span,{style:{color:"#91B4D5"},children:"=>"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7C0"},children:"  return"}),n(l.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    <"}),n(l.span,{style:{color:"#5DE4C7"},children:"span"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      {"}),n(l.span,{style:{color:"#91B4D5"},children:"..."}),n(l.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"      class"}),n(l.span,{style:{color:"#91B4D5"},children:"="}),n(l.span,{style:{color:"#E4F0FB"},children:"{"}),n(l.span,{style:{color:"#E4F0FBD0"},children:"cn"}),n(l.span,{style:{color:"#A6ACCD"},children:"("}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"ml-auto text-xs tracking-widest opacity-60"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:","}),n(l.span,{style:{color:"#E4F0FB"},children:" props"}),n(l.span,{style:{color:"#A6ACCD"},children:"."}),n(l.span,{style:{color:"#E4F0FB"},children:"class"}),n(l.span,{style:{color:"#A6ACCD"},children:")"}),n(l.span,{style:{color:"#E4F0FB"},children:"}"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#E4F0FB"},children:"    >"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"      <"}),n(l.span,{style:{color:"#5DE4C7"},children:"Slot"}),n(l.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"    </"}),n(l.span,{style:{color:"#5DE4C7"},children:"span"}),n(l.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"});"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"export"}),n(l.span,{style:{color:"#91B4D5"},children:" const"}),n(l.span,{style:{color:"#E4F0FB"},children:" Dropdown"}),n(l.span,{style:{color:"#91B4D5"},children:" ="}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Root"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Trigger"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Popover"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Separator"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Item"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  ItemIndicator"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Group"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  GroupLabel"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FB"},children:"  Shortcut"}),n(l.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"};"})})]})})})]})},"_createMdxContent_0",[]));function D(s,l,o){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/styled/dropdown/index.mdx: Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}const w=(s={})=>{const l=e(a,{children:e(C,s,3,null)},3,"qUq1gLz4");return typeof MDXLayout=="function"?n(MDXLayout,{children:l}):l};export{w as default,f as frontmatter,u as head,m as headings};
