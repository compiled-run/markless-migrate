import{z as s,t as o,O as c,S as l,U as a,D as e}from"./q-CsvfasCP.js";import{u as i}from"./q-D_NppxYb.js";const h=[{text:"Using the Styled Kit",id:"using-the-styled-kit",level:1},{text:"CLI",id:"cli",level:2},{text:"Generating components using the CLI",id:"generating-components-using-the-cli",level:3},{text:"Manual installation",id:"manual-installation",level:2},{text:"Step 1: Install the Headless Kit and qwikest icons",id:"step-1-install-the-headless-kit-and-qwikest-icons",level:3},{text:"Step 2: copy/paste your theme config",id:"step-2-copypaste-your-theme-config",level:3},{text:"Step 3: Find the components you need in the docs and copy/paste them into your project",id:"step-3-find-the-components-you-need-in-the-docs-and-copypaste-them-into-your-project",level:3},{text:"Bonus step: add a barrel file to ~/components/ui",id:"bonus-step-add-a-barrel-file-to-componentsui",level:3},{text:"Tailwind CSS editor extension",id:"tailwind-css-editor-extension",level:2},{text:"VSCode",id:"vscode",level:3},{text:"JetBrains IDEs",id:"jetbrains-ides",level:3}],C={title:"Qwik UI | Styled Kit - Installation",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},y={title:"Qwik UI | Styled Kit - Installation"},d=o(a(r=>{const n={a:"a",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",strong:"strong",...i(),...r.components};return l(e,{children:[l(n.h1,{id:"using-the-styled-kit",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#using-the-styled-kit",children:l(n.span,{class:"icon icon-link"})}),"Using the Styled Kit"]}),`
`,l(n.h2,{id:"cli",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#cli",children:l(n.span,{class:"icon icon-link"})}),"CLI"]}),`
`,l(n.p,{children:"Simply run the following command:"}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"pnpm dlx qwik-ui init",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"pnpm"}),l(n.span,{style:{color:"#ADD7FF"},children:" dlx"}),l(n.span,{style:{color:"#ADD7FF"},children:" qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" init"})]})})})}),`
`,l(n.p,{children:['(or "',l(n.strong,{children:"npx qwik-ui init"}),'" if you prefer npm)']}),`
`,l(n.p,{children:["This will help you install tailwind, create a ",l(n.code,{children:"qwik-ui.config.json"})," file and modify your root/global css and tailwind config files with the necessary Qwik UI design system variables and values (",l(n.a,{href:"#manual-installation",children:"see below"}),")"]}),`
`,l(n.h3,{id:"generating-components-using-the-cli",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#generating-components-using-the-cli",children:l(n.span,{class:"icon icon-link"})}),"Generating components using the CLI"]}),`
`,l(n.p,{children:"When you want to add a component you can run:"}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"pnpm qwik-ui add",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"pnpm"}),l(n.span,{style:{color:"#ADD7FF"},children:" qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"})]})})})}),`
`,l(n.p,{children:[`Or if you know a specific component you want to add, let's say "`,l(n.code,{children:"input"}),'", you can run:']}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"pnpm qwik-ui add input",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"pnpm"}),l(n.span,{style:{color:"#ADD7FF"},children:" qwik-ui"}),l(n.span,{style:{color:"#ADD7FF"},children:" add"}),l(n.span,{style:{color:"#ADD7FF"},children:" input"})]})})})}),`
`,l(n.h2,{id:"manual-installation",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#manual-installation",children:l(n.span,{class:"icon icon-link"})}),"Manual installation"]}),`
`,l(n.h3,{id:"step-1-install-the-headless-kit-and-qwikest-icons",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#step-1-install-the-headless-kit-and-qwikest-icons",children:l(n.span,{class:"icon icon-link"})}),"Step 1: Install the Headless Kit and qwikest icons"]}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:"pnpm i -D @qwik-ui/headless @qwikest/icons @qwik-ui/utils tw-animate-css class-variance-authority",children:l(n.code,{children:l(n.span,{class:"line",children:[l(n.span,{style:{color:"#91B4D5"},children:"pnpm"}),l(n.span,{style:{color:"#ADD7FF"},children:" i"}),l(n.span,{style:{color:"#ADD7FF"},children:" -D"}),l(n.span,{style:{color:"#ADD7FF"},children:" @qwik-ui/headless"}),l(n.span,{style:{color:"#ADD7FF"},children:" @qwikest/icons"}),l(n.span,{style:{color:"#ADD7FF"},children:" @qwik-ui/utils"}),l(n.span,{style:{color:"#ADD7FF"},children:" tw-animate-css"}),l(n.span,{style:{color:"#ADD7FF"},children:" class-variance-authority"})]})})})}),`
`,l(n.h3,{id:"step-2-copypaste-your-theme-config",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#step-2-copypaste-your-theme-config",children:l(n.span,{class:"icon icon-link"})}),"Step 2: copy/paste your theme config"]}),`
`,l(n.p,{children:'Click on "make it yours" -> choose your favorite color theme and style -> copy/paste the css-variables config to your global css file.'}),`
`,l(n.p,{children:"Here's an example:"}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`@layer base, qwik-ui, popover-polyfill, theme, components, utilities;
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
    --primary: var(--color-cyan-600);
    --primary-foreground: white;
    --secondary: var(--color-slate-900);
    --secondary-foreground: white;
    --accent: var(--color-slate-100);
    --accent-foreground: var(--color-slate-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-900);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0.5rem;
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
    --primary: var(--color-cyan-600);
    --primary-foreground: white;
    --secondary: var(--color-slate-100);
    --secondary-foreground: black;
    --accent: var(--color-slate-700);
    --accent-foreground: var(--color-slate-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-300);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0.5rem;
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
}`,children:l(n.code,{children:[l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@layer base, qwik-ui, popover-polyfill, theme, components, utilities;"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"@import "}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"tailwindcss"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"@import "}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#5DE4C7"},children:"tw-animate-css"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@custom-variant dark (&:is(.dark *));"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@layer base {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"  :"}),l(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"root"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --background: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --foreground: var(--color-slate-950);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --muted: var(--color-slate-100);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --muted-foreground: var(--color-slate-700);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --popover: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --popover-foreground: var(--color-slate-900);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --card: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --card-foreground: var(--color-slate-900);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --border: var(--color-slate-200);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --input: var(--color-slate-200);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --primary: var(--color-cyan-600);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --primary-foreground: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --secondary: var(--color-slate-900);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --secondary-foreground: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --accent: var(--color-slate-100);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --accent-foreground: var(--color-slate-900);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --alert: var(--color-red-500);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --alert-foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --ring: var(--color-slate-900);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0px"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width: "}),l(n.span,{style:{color:"#5DE4C7"},children:"1px"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-radius: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.5rem"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-base: "}),l(n.span,{style:{color:"#ADD7FF"},children:"none"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xs: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.05"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xs: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.05"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-sm: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 3px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-md: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 6px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -2px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-lg: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 10px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 15px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -3px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 6px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -4px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xl: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 20px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 25px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -5px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 8px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 10px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -6px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xl: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 25px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 50px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -12px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.25"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-inner: "}),l(n.span,{style:{color:"#ADD7FF"},children:"inset"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgba("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.01"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --transform-press: scale("}),l(n.span,{style:{color:"#5DE4C7"},children:"0.95"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"  ."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"dark"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --background: var(--color-slate-950);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --muted: var(--color-slate-800);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --muted-foreground: var(--color-slate-300);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --popover: var(--color-slate-950);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --popover-foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --card: var(--color-slate-950);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --card-foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --border: var(--color-slate-800);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --input: var(--color-slate-800);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --primary: var(--color-cyan-600);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --primary-foreground: "}),l(n.span,{style:{color:"#ADD7FF"},children:"white"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --secondary: var(--color-slate-100);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --secondary-foreground: "}),l(n.span,{style:{color:"#ADD7FF"},children:"black"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --accent: var(--color-slate-700);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --accent-foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --alert: var(--color-red-500);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --alert-foreground: var(--color-slate-50);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --ring: var(--color-slate-300);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0px"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width: "}),l(n.span,{style:{color:"#5DE4C7"},children:"1px"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-radius: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.5rem"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-base: "}),l(n.span,{style:{color:"#ADD7FF"},children:"none"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xs: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.05"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xs: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.05"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-sm: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 3px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 1px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-md: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 6px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -1px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -2px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-lg: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 10px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 15px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -3px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 6px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -4px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xl: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 20px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 25px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -5px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:"), "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 8px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 10px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -6px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.1"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xl: "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 25px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 50px"}),l(n.span,{style:{color:"#5DE4C7"},children:" -12px"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgb("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" / "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.25"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-inner: "}),l(n.span,{style:{color:"#ADD7FF"},children:"inset"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#5DE4C7"},children:" 2px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 4px"}),l(n.span,{style:{color:"#5DE4C7"},children:" 0"}),l(n.span,{style:{color:"#A6ACCD"},children:" rgba("}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#5DE4C7"},children:"0.01"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --transform-press: scale("}),l(n.span,{style:{color:"#5DE4C7"},children:"0.95"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  @theme {"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-background: var(--background);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-foreground: var(--foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-card: var(--card);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-card-foreground: var(--card-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-popover: var(--popover);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-popover-foreground: var(--popover-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-primary: var(--primary);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-primary-foreground: var(--primary-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-secondary: var(--secondary);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-secondary-foreground: var(--secondary-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-muted: var(--muted);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-muted-foreground: var(--muted-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-accent: var(--accent);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-accent-foreground: var(--accent-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-alert: var(--alert);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-alert-foreground: var(--alert-foreground);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-border: var(--border);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-input: var(--input);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --color-ring: var(--ring);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-xs: var(--border-radius);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-sm: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"125rem"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-md: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"375rem"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-lg: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"5rem"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-xl: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"75rem"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-2xl: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 1rem);"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --radius-3xl: calc(var(--border-radius) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 1"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"5rem"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-base: var(--shadow-base);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xs: var(--shadow-2xs);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xs: var(--shadow-xs);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-sm: var(--shadow-sm);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-md: var(--shadow-md);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-lg: var(--shadow-lg);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-xl: var(--shadow-xl);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-2xl: var(--shadow-2xl);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --shadow-inner: var(--shadow-inner);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --default-border-width: calc(var(--border-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 1px);"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width-base: var(--border-width);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width-2: calc(var(--border-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 2px);"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width-4: calc(var(--border-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 4px);"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --border-width-8: calc(var(--border-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 8px);"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width-0: 0px;"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width-base: var(--stroke-width);"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width-1: calc(var(--stroke-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 1px);"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --stroke-width-2: calc(var(--stroke-width) "}),l(n.span,{style:{color:"#91B4D5"},children:"+"}),l(n.span,{style:{color:"#A6ACCD"},children:" 2px);"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --animate-accordion-down: "}),l(n.span,{style:{color:"#5DE4C7"},children:"collapsible-down"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"2s"}),l(n.span,{style:{color:"#5DE4C7"},children:" ease-out"}),l(n.span,{style:{color:"#A6ACCD"},children:" forwards;"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    --animate-accordion-up: "}),l(n.span,{style:{color:"#5DE4C7"},children:"collapsible-up"}),l(n.span,{style:{color:"#A6ACCD"},children:" 0"}),l(n.span,{style:{color:"#E4F0FBD0",fontStyle:"italic"},children:"."}),l(n.span,{style:{color:"#5FB3A1",fontStyle:"italic"},children:"2s"}),l(n.span,{style:{color:"#5DE4C7"},children:" ease-out"}),l(n.span,{style:{color:"#A6ACCD"},children:" forwards;"})]}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    @keyframes "}),l(n.span,{style:{color:"#E4F0FB"},children:"collapsible-down"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      from {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        height"}),l(n.span,{style:{color:"#A6ACCD"},children:": "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      to {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        height"}),l(n.span,{style:{color:"#A6ACCD"},children:": var(--qwikui-collapsible-content-height);"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"    @keyframes "}),l(n.span,{style:{color:"#E4F0FB"},children:"collapsible-up"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      from {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        height"}),l(n.span,{style:{color:"#A6ACCD"},children:": var(--qwikui-collapsible-content-height);"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      to {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#ADD7FF"},children:"        height"}),l(n.span,{style:{color:"#A6ACCD"},children:": "}),l(n.span,{style:{color:"#5DE4C7"},children:"0"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"      }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@utility press {"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  transform: var(--transform-press);"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@utility border-width-* {"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"  border: --value(--border-width-"}),l(n.span,{style:{color:"#5DE4C7"},children:"*"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@utility stroke-width-* {"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:"  stroke: --value(--stroke-width-"}),l(n.span,{style:{color:"#5DE4C7"},children:"*"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@utility shadow-* {"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"  /* prettier-ignore */"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"  box-shadow"}),l(n.span,{style:{color:"#A6ACCD"},children:": --value(--shadow-"}),l(n.span,{style:{color:"#5DE4C7"},children:"*"}),l(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,l(n.span,{class:"line"}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"@layer base {"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"  *"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    @apply border-border outline-ring/50;"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"  body"}),l(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"    @apply bg-background text-foreground;"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,l(n.h3,{id:"step-3-find-the-components-you-need-in-the-docs-and-copypaste-them-into-your-project",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#step-3-find-the-components-you-need-in-the-docs-and-copypaste-them-into-your-project",children:l(n.span,{class:"icon icon-link"})}),"Step 3: Find the components you need in the docs and copy/paste them into your project"]}),`
`,l(n.p,{children:"You will find the components code in their corresponding link in the docs."}),`
`,l(n.h3,{id:"bonus-step-add-a-barrel-file-to-componentsui",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#bonus-step-add-a-barrel-file-to-componentsui",children:l(n.span,{class:"icon icon-link"})}),"Bonus step: add a barrel file to ~/components/ui"]}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`export * from './accordion/accordion';
export * from './alert/alert';
export * from './avatar/avatar';
export * from './badge/badge';
export * from './breadcrumb/breadcrumb';
export * from './button/button';
export * from './card/card';
export * from './carousel/carousel';
export * from './checkbox/checkbox';
export * from './combobox/combobox';
export * from './dropdown/dropdown';
export * from './input/input';
export * from './label/label';
export * from './modal/modal';
export * from './popover/popover';
export * from './progress/progress';
export * from './radio-group/radio-group';
export * from './separator/separator';
export * from './skeleton/skeleton';
export * from './tabs/tabs';
export * from './textarea/textarea';
export * from './select/select';
export * from './toggle/toggle';
export * from './toggle-group/toggle-group';
export * from './tooltip/tooltip';`,children:l(n.code,{children:[l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./accordion/accordion"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./alert/alert"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./avatar/avatar"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./badge/badge"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./breadcrumb/breadcrumb"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./button/button"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./card/card"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./carousel/carousel"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./checkbox/checkbox"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./combobox/combobox"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./dropdown/dropdown"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./input/input"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./label/label"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./modal/modal"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./popover/popover"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./progress/progress"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./radio-group/radio-group"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./separator/separator"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./skeleton/skeleton"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./tabs/tabs"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./textarea/textarea"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./select/select"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./toggle/toggle"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./toggle-group/toggle-group"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#5DE4C7"},children:"export * "}),l(n.span,{style:{color:"#A6ACCD"},children:"from"}),l(n.span,{style:{color:"#A6ACCD"},children:" '"}),l(n.span,{style:{color:"#5DE4C7"},children:"./tooltip/tooltip"}),l(n.span,{style:{color:"#A6ACCD"},children:"'"}),l(n.span,{style:{color:"#A6ACCD"},children:";"})]})]})})}),`
`,l(n.p,{children:["This way you can now ",l(n.code,{children:"import { Accordion, Alert, ... } from '~/components/ui';"})," 👯‍♀️"]}),`
`,l(n.p,{children:["(",l(n.strong,{children:"small tip:"})," you can comment out the components you don't use!)"]}),`
`,l(n.h2,{id:"tailwind-css-editor-extension",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tailwind-css-editor-extension",children:l(n.span,{class:"icon icon-link"})}),"Tailwind CSS editor extension"]}),`
`,l(n.p,{children:"You can configure your code editor to recognize the Qwik UI utility functions. This gives you the same auto-completion that you get for the default Tailwind CSS classes."}),`
`,l(n.p,{children:"Use the following configuration with your chosen editor:"}),`
`,l(e,{children:l(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`{
  "tailwindCSS.classFunctions": ["cva", "cn"],
}`,children:l(n.code,{children:[l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"{"})}),`
`,l(n.span,{class:"line",children:[l(n.span,{style:{color:"#A6ACCD"},children:'  "'}),l(n.span,{style:{color:"#E4F0FB"},children:"tailwindCSS.classFunctions"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#A6ACCD"},children:": ["}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"cva"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#A6ACCD"},children:", "}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#5DE4C7"},children:"cn"}),l(n.span,{style:{color:"#A6ACCD"},children:'"'}),l(n.span,{style:{color:"#A6ACCD"},children:"],"})]}),`
`,l(n.span,{class:"line",children:l(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,l(n.h3,{id:"vscode",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#vscode",children:l(n.span,{class:"icon icon-link"})}),"VSCode"]}),`
`,l(n.p,{children:["The ",l(n.a,{href:"https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss",children:"Tailwind CSS IntelliSense"})," extension is available to download for VSCode."]}),`
`,l(n.p,{children:["Install it, open your ",l(n.a,{href:"https://code.visualstudio.com/docs/getstarted/settings",children:"settings.json"})," file, and append the provided configuration."]}),`
`,l(n.h3,{id:"jetbrains-ides",children:[l(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#jetbrains-ides",children:l(n.span,{class:"icon icon-link"})}),"JetBrains IDEs"]}),`
`,l(n.p,{children:["The ",l(n.a,{href:"https://plugins.jetbrains.com/plugin/15321-tailwind-css",children:"Tailwind CSS"})," plugin is already bundled with JetBrains IDEs."]}),`
`,l(n.p,{children:[l(n.a,{href:"jetbrains://idea/settings?name=Languages+%26+Frameworks--Style+Sheets--Tailwind+CSS",children:"Click here"})," to navigate to ",l(n.em,{children:"Settings"})," > ",l(n.em,{children:"Languages & Frameworks"})," > ",l(n.em,{children:"Style Sheets"})," > ",l(n.em,{children:"Tailwind CSS"}),", and append the provided configuration."]})]})},"_createMdxContent_0",[])),A=(r={})=>{const n=s(c,{children:s(d,r,3,null)},3,"rAyyF5xO");return typeof MDXLayout=="function"?l(MDXLayout,{children:n}):n};export{A as default,y as frontmatter,C as head,h as headings};
