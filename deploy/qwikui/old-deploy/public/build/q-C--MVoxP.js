import{z as r,t as o,O as c,S as n,U as a,D as s}from"./q-CsvfasCP.js";import{u as i}from"./q-D_NppxYb.js";const h=[{text:"Tailwind 3 Migration Guide",id:"tailwind-3-migration-guide",level:1},{text:"What's New",id:"whats-new",level:2},{text:"How to upgrade",id:"how-to-upgrade",level:2},{text:"1. Follow the Tailwind v4 Upgrade Guide",id:"1-follow-the-tailwind-v4-upgrade-guide",level:3},{text:"2. Update your CSS variables",id:"2-update-your-css-variables",level:3},{text:"3. Update your dependencies",id:"3-update-your-dependencies",level:3},{text:"4. Update the Modal component",id:"4-update-the-modal-component",level:3},{text:"Troubleshooting",id:"troubleshooting",level:2}],C={title:"Qwik UI | Styled Kit - Tailwind 3 Migration",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},y={title:"Qwik UI | Styled Kit - Tailwind 3 Migration"},d=o(a(e=>{const l={a:"a",code:"code",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",pre:"pre",span:"span",ul:"ul",...i(),...e.components};return n(s,{children:[n(l.h1,{id:"tailwind-3-migration-guide",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#tailwind-3-migration-guide",children:n(l.span,{class:"icon icon-link"})}),"Tailwind 3 Migration Guide"]}),`
`,n(l.h2,{id:"whats-new",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#whats-new",children:n(l.span,{class:"icon icon-link"})}),"What's New"]}),`
`,n(l.ul,{children:[`
`,n(l.li,{children:"The CLI can now initialize projects with Tailwind v4."}),`
`,n(l.li,{children:"Full support for the new @theme, @utility and @layer directives."}),`
`,n(l.li,{children:"The theme configuration is now done in css only."}),`
`,n(l.li,{children:"HSL colors are now converted to OKLCH."}),`
`,n(l.li,{children:"We've fixed and cleaned up the style of the components."}),`
`,n(l.li,{children:"All the components are formatted with the new prettier-plugin-tailwindcss classes order."}),`
`,n(l.li,{children:"The Collapsible component has been updated to work with the new Tailwind v4."}),`
`,n(l.li,{children:"The animations are now handled by the new tw-animate-css package."}),`
`]}),`
`,n(l.p,{children:"Note: this is (almost) non breaking. Except for migrating your config to css and some small fixes in the Modal component, you can still keep your components the way they are and use the simple or brutalist presets, or even your custom styles, and everything should work."}),`
`,n(l.h2,{id:"how-to-upgrade",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#how-to-upgrade",children:n(l.span,{class:"icon icon-link"})}),"How to upgrade"]}),`
`,n(l.h3,{id:"1-follow-the-tailwind-v4-upgrade-guide",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#1-follow-the-tailwind-v4-upgrade-guide",children:n(l.span,{class:"icon icon-link"})}),"1. Follow the Tailwind v4 Upgrade Guide"]}),`
`,n(l.p,{children:["Upgrade to Tailwind v4 by following the official upgrade guide: ",n(l.a,{href:"https://tailwindcss.com/docs/upgrade-guide",children:"https://tailwindcss.com/docs/upgrade-guide"}),"."]}),`
`,n(l.p,{children:["Using ",n(l.code,{children:"npx @tailwindcss/upgrade"})," should do the trick."]}),`
`,n(l.h3,{id:"2-update-your-css-variables",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#2-update-your-css-variables",children:n(l.span,{class:"icon icon-link"})}),"2. Update your CSS variables"]}),`
`,n(l.p,{children:"The tailwind cli codemod will automatically update your CSS variables to use the new @theme directive, but it will miss some configuration from the tailwind.config.cjs file."}),`
`,n(l.p,{children:["To update your config, go to ",n(l.a,{href:"https://qwik-ui.com/",children:"https://qwik-ui.com/"}),', open the "Make it yours" modal and copy/paste the css-variables config to your global css file. Update it accordingly to your project needs.']}),`
`,n(l.p,{children:"If you are using custom colors, you might need to use @theme inline instead of @theme."}),`
`,n(l.p,{children:"Here is an example of the css config:"}),`
`,n(s,{children:n(l.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`@layer base, qwik-ui, popover-polyfill, theme, components, utilities;
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@layer base {
  :root {
    --background: white;
    --foreground: var(--color-slate-950);
    --muted: var(--color-slate-100);
    --muted-foreground: var(--color-slate-700);
    --popover: white;
    --popover-foreground: var(--color-slate-900);
    --card: white;
    --card-foreground: var(--color-slate-900);
    --border: var(--color-slate-200);
    --input: var(--color-slate-200);
    --primary: var(--color-blue-200);
    --primary-foreground: black;
    --secondary: var(--color-slate-900);
    --secondary-foreground: white;
    --accent: var(--color-slate-100);
    --accent-foreground: var(--color-slate-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-900);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0rem;
    --shadow-base: none;
    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: scale(0.95);
  }
  .dark {
    --background: var(--color-slate-950);
    --foreground: var(--color-slate-50);
    --muted: var(--color-slate-800);
    --muted-foreground: var(--color-slate-300);
    --popover: var(--color-slate-950);
    --popover-foreground: var(--color-slate-50);
    --card: var(--color-slate-950);
    --card-foreground: var(--color-slate-50);
    --border: var(--color-slate-800);
    --input: var(--color-slate-800);
    --primary: var(--color-blue-200);
    --primary-foreground: black;
    --secondary: var(--color-slate-100);
    --secondary-foreground: black;
    --accent: var(--color-slate-700);
    --accent-foreground: var(--color-slate-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-300);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0rem;
    --shadow-base: none;
    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: scale(0.95);
  }
}

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-alert: var(--alert);
  --color-alert-foreground: var(--alert-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-xs: var(--border-radius);
  --radius-sm: calc(var(--border-radius) + 0.125rem);
  --radius-md: calc(var(--border-radius) + 0.375rem);
  --radius-lg: calc(var(--border-radius) + 0.5rem);
  --radius-xl: calc(var(--border-radius) + 0.75rem);
  --radius-2xl: calc(var(--border-radius) + 1rem);
  --radius-3xl: calc(var(--border-radius) + 1.5rem);
  --shadow-base: var(--shadow-base);
  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
  --shadow-inner: var(--shadow-inner);
  --default-border-width: calc(var(--border-width) + 1px);
  --border-width-base: var(--border-width);
  --border-width-2: calc(var(--border-width) + 2px);
  --border-width-4: calc(var(--border-width) + 4px);
  --border-width-8: calc(var(--border-width) + 8px);
  --stroke-width-0: 0px;
  --stroke-width-base: var(--stroke-width);
  --stroke-width-1: calc(var(--stroke-width) + 1px);
  --stroke-width-2: calc(var(--stroke-width) + 2px);
  --animate-accordion-down: collapsible-down 0.2s ease-out forwards;
  --animate-accordion-up: collapsible-up 0.2s ease-out forwards;

  @keyframes collapsible-down {
    from {
      height: 0;
    }
    to {
      height: var(--qwikui-collapsible-content-height);
    }
  }
  @keyframes collapsible-up {
    from {
      height: var(--qwikui-collapsible-content-height);
    }
    to {
      height: 0;
    }
  }
}

@utility press {
  transform: var(--transform-press);
}
@utility border-width-* {
  /* prettier-ignore */
  border: --value(--border-width-*);
}
@utility stroke-width-* {
  /* prettier-ignore */
  stroke: --value(--stroke-width-*);
}
@utility shadow-* {
  /* prettier-ignore */
  box-shadow: --value(--shadow-*);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}`,children:n(l.code,{children:[n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@layer base, qwik-ui, popover-polyfill, theme, components, utilities;"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"@import "}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"tailwindcss"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"@import "}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#5DE4C7"},children:"tw-animate-css"}),n(l.span,{style:{color:"#A6ACCD"},children:"'"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@custom-variant dark (&:is(.dark *));"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@layer base {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"  :"}),n(l.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"root"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --background: "}),n(l.span,{style:{color:"#ADD7FF"},children:"white"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --foreground: var(--color-slate-950);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --muted: var(--color-slate-100);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --muted-foreground: var(--color-slate-700);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --popover: "}),n(l.span,{style:{color:"#ADD7FF"},children:"white"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --popover-foreground: var(--color-slate-900);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --card: "}),n(l.span,{style:{color:"#ADD7FF"},children:"white"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --card-foreground: var(--color-slate-900);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --border: var(--color-slate-200);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --input: var(--color-slate-200);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --primary: var(--color-blue-200);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --primary-foreground: "}),n(l.span,{style:{color:"#ADD7FF"},children:"black"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --secondary: var(--color-slate-900);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --secondary-foreground: "}),n(l.span,{style:{color:"#ADD7FF"},children:"white"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --accent: var(--color-slate-100);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --accent-foreground: var(--color-slate-900);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --alert: var(--color-red-500);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --alert-foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --ring: var(--color-slate-900);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --border-width: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0px"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --stroke-width: "}),n(l.span,{style:{color:"#5DE4C7"},children:"1px"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --border-radius: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0rem"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-base: "}),n(l.span,{style:{color:"#ADD7FF"},children:"none"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xs: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.05"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-xs: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.05"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-sm: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 3px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-md: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 6px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -2px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-lg: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 10px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 15px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -3px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 6px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -4px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-xl: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 20px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 25px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -5px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 8px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 10px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -6px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xl: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 25px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 50px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -12px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.25"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-inner: "}),n(l.span,{style:{color:"#ADD7FF"},children:"inset"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgba("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.01"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --transform-press: scale("}),n(l.span,{style:{color:"#5DE4C7"},children:"0.95"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"  ."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"dark"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --background: var(--color-slate-950);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --muted: var(--color-slate-800);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --muted-foreground: var(--color-slate-300);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --popover: var(--color-slate-950);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --popover-foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --card: var(--color-slate-950);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --card-foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --border: var(--color-slate-800);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --input: var(--color-slate-800);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --primary: var(--color-blue-200);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --primary-foreground: "}),n(l.span,{style:{color:"#ADD7FF"},children:"black"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --secondary: var(--color-slate-100);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --secondary-foreground: "}),n(l.span,{style:{color:"#ADD7FF"},children:"black"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --accent: var(--color-slate-700);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --accent-foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --alert: var(--color-red-500);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --alert-foreground: var(--color-slate-50);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    --ring: var(--color-slate-300);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --border-width: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0px"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --stroke-width: "}),n(l.span,{style:{color:"#5DE4C7"},children:"1px"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --border-radius: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0rem"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-base: "}),n(l.span,{style:{color:"#ADD7FF"},children:"none"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xs: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.05"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-xs: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.05"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-sm: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 3px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 1px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-md: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 6px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -1px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -2px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-lg: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 10px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 15px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -3px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 6px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -4px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-xl: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 20px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 25px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -5px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:"), "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 8px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 10px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -6px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.1"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xl: "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 25px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 50px"}),n(l.span,{style:{color:"#5DE4C7"},children:" -12px"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgb("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" / "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.25"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --shadow-inner: "}),n(l.span,{style:{color:"#ADD7FF"},children:"inset"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#5DE4C7"},children:" 2px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 4px"}),n(l.span,{style:{color:"#5DE4C7"},children:" 0"}),n(l.span,{style:{color:"#A6ACCD"},children:" rgba("}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:", "}),n(l.span,{style:{color:"#5DE4C7"},children:"0.01"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"    --transform-press: scale("}),n(l.span,{style:{color:"#5DE4C7"},children:"0.95"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@theme {"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-background: var(--background);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-foreground: var(--foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-card: var(--card);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-card-foreground: var(--card-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-popover: var(--popover);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-popover-foreground: var(--popover-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-primary: var(--primary);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-primary-foreground: var(--primary-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-secondary: var(--secondary);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-secondary-foreground: var(--secondary-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-muted: var(--muted);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-muted-foreground: var(--muted-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-accent: var(--accent);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-accent-foreground: var(--accent-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-alert: var(--alert);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-alert-foreground: var(--alert-foreground);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-border: var(--border);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-input: var(--input);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --color-ring: var(--ring);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-xs: var(--border-radius);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-sm: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"125rem"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-md: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"375rem"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-lg: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"5rem"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-xl: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"75rem"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-2xl: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 1rem);"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --radius-3xl: calc(var(--border-radius) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 1"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"5rem"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-base: var(--shadow-base);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-2xs: var(--shadow-2xs);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-xs: var(--shadow-xs);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-sm: var(--shadow-sm);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-md: var(--shadow-md);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-lg: var(--shadow-lg);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-xl: var(--shadow-xl);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-2xl: var(--shadow-2xl);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --shadow-inner: var(--shadow-inner);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --default-border-width: calc(var(--border-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 1px);"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --border-width-base: var(--border-width);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --border-width-2: calc(var(--border-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 2px);"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --border-width-4: calc(var(--border-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 4px);"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --border-width-8: calc(var(--border-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 8px);"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --stroke-width-0: 0px;"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  --stroke-width-base: var(--stroke-width);"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --stroke-width-1: calc(var(--stroke-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 1px);"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --stroke-width-2: calc(var(--stroke-width) "}),n(l.span,{style:{color:"#91B4D5"},children:"+"}),n(l.span,{style:{color:"#A6ACCD"},children:" 2px);"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --animate-accordion-down: "}),n(l.span,{style:{color:"#5DE4C7"},children:"collapsible-down"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"2s"}),n(l.span,{style:{color:"#5DE4C7"},children:" ease-out"}),n(l.span,{style:{color:"#A6ACCD"},children:" forwards;"})]}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  --animate-accordion-up: "}),n(l.span,{style:{color:"#5DE4C7"},children:"collapsible-up"}),n(l.span,{style:{color:"#A6ACCD"},children:" 0"}),n(l.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),n(l.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"2s"}),n(l.span,{style:{color:"#5DE4C7"},children:" ease-out"}),n(l.span,{style:{color:"#A6ACCD"},children:" forwards;"})]}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  @keyframes "}),n(l.span,{style:{color:"#E4F0FB"},children:"collapsible-down"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    from {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      height"}),n(l.span,{style:{color:"#A6ACCD"},children:": "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    to {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      height"}),n(l.span,{style:{color:"#A6ACCD"},children:": var(--qwikui-collapsible-content-height);"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  @keyframes "}),n(l.span,{style:{color:"#E4F0FB"},children:"collapsible-up"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    from {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      height"}),n(l.span,{style:{color:"#A6ACCD"},children:": var(--qwikui-collapsible-content-height);"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    to {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#ADD7FF"},children:"      height"}),n(l.span,{style:{color:"#A6ACCD"},children:": "}),n(l.span,{style:{color:"#5DE4C7"},children:"0"}),n(l.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@utility press {"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  transform: var(--transform-press);"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@utility border-width-* {"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  border: --value(--border-width-"}),n(l.span,{style:{color:"#5DE4C7"},children:"*"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@utility stroke-width-* {"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#A6ACCD"},children:"  stroke: --value(--stroke-width-"}),n(l.span,{style:{color:"#5DE4C7"},children:"*"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@utility shadow-* {"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"  box-shadow"}),n(l.span,{style:{color:"#A6ACCD"},children:": --value(--shadow-"}),n(l.span,{style:{color:"#5DE4C7"},children:"*"}),n(l.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,n(l.span,{class:"line"}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"@layer base {"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"  *"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    @apply border-border outline-ring/50;"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:[n(l.span,{style:{color:"#5DE4C7"},children:"  body"}),n(l.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"    @apply bg-background text-foreground;"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,n(l.span,{class:"line",children:n(l.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,n(l.h3,{id:"3-update-your-dependencies",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#3-update-your-dependencies",children:n(l.span,{class:"icon icon-link"})}),"3. Update your dependencies"]}),`
`,n(l.ul,{children:[`
`,n(l.li,{children:[`
`,n(l.p,{children:"Install the @tailwindcss/vite package and pass it to your vite.config plugins array."}),`
`]}),`
`,n(l.li,{children:[`
`,n(l.p,{children:"Install the tw-animate-css package and remove the old tailwindcss-animate one."}),`
`]}),`
`]}),`
`,n(l.h3,{id:"4-update-the-modal-component",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#4-update-the-modal-component",children:n(l.span,{class:"icon icon-link"})}),"4. Update the Modal component"]}),`
`,n(l.p,{children:["Add ",n(l.code,{children:'"w-full"'})," to Modal PanelVariants position.top and position.bottom; add ",n(l.code,{children:'"m-auto"'})," to position.center"]}),`
`,n(l.h2,{id:"troubleshooting",children:[n(l.a,{"aria-hidden":"true",tabindex:"-1",href:"#troubleshooting",children:n(l.span,{class:"icon icon-link"})}),"Troubleshooting"]}),`
`,n(l.p,{children:"Make sure to remove your tailwind.config.cjs and postcss.config.cjs files. They can cause conflicts with the new tailwind 4 config."}),`
`,n(l.p,{children:["If you are in a monorepo, make sure to ",n(l.code,{children:"@source “../../../path/to/your/components“;"})]}),`
`,n(l.p,{children:"If you didn't modify some components, you can re-copy/paste (or re-install them with the cli) for their most up to date version."})]})},"_createMdxContent_0",[])),A=(e={})=>{const l=r(c,{children:r(d,e,3,null)},3,"41EtA6lA");return typeof MDXLayout=="function"?n(MDXLayout,{children:l}):l};export{A as default,y as frontmatter,C as head,h as headings};
