import{t as o,N as t,z as c,O as p,S as e,U as h,D as l}from"./q-CsvfasCP.js";import{u as m}from"./q-D_NppxYb.js";import{_ as r}from"./q-BKZ00VYc.js";import{C as u}from"./q-B0Yj9KhA.js";const g=o(t(()=>r(()=>import("./q-B3kojgBp.js"),[]),"s_BAgynZfZn0Q")),w=o(t(()=>r(()=>import("./q-BFpwqpT2.js"),[]),"s_ax1QWQoYwfY")),k="/assets/BdkTkaD8-qwik-city-cli.webp",y="/assets/D0d0yVmX-astro-cli.webp",f="/assets/BvyUTxE3-qwikdev-astro-cli.webp",a=o(t(()=>r(()=>import("./q-CpP2L88o.js"),[]),"s_WxalC0m4XOU")),b=o(t(()=>r(()=>import("./q-QTyHROor.js"),[]),"s_3UZfE10eWUc")),x=o(t(()=>r(()=>import("./q-BzSi8KfY.js"),[]),"s_qgn69EsMEhA")),d=o(t(()=>r(()=>import("./q-CzfVbJFo.js"),[]),"s_qabrZ86x6rs")),L=[{text:"Installation",id:"installation",level:1},{text:"Meta-framework guides",id:"meta-framework-guides",level:2},{text:"Building Blocks",id:"building-blocks",level:2},{text:"Qwik City",id:"qwik-city",level:2},{text:"Astro",id:"astro",level:2}],S={title:"Qwik UI - Installation",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},B={title:"Qwik UI - Installation"},C={npm:"npm i -D @qwik-ui/headless",yarn:"yarn add -D @qwik-ui/headless",pnpm:"pnpm i -D @qwik-ui/headless"},A={npm:"npm create qwik@latest",yarn:"yarn create qwik",pnpm:"pnpm create qwik@latest",bun:"bun create qwik@latest"},D={npm:"npm create astro@latest",yarn:"yarn create astro",pnpm:"pnpm create astro@latest"},v={npm:"npx astro add @qwikdev/astro",yarn:"yarn astro add @qwikdev/astro",pnpm:"pnpm astro add @qwikdev/astro"},_=o(h(s=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",p:"p",pre:"pre",span:"span",strong:"strong",...m(),...s.components},{InstallSnippet:i}=n;return i||q("InstallSnippet"),e(l,{children:[e(n.h1,{id:"installation",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#installation",children:e(n.span,{class:"icon icon-link"})}),"Installation"]}),`
`,e(n.p,{children:"Install Qwik UI with your choice of package manager below:"}),`
`,e(i,{packages:C}),`
`,e(n.h2,{id:"meta-framework-guides",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#meta-framework-guides",children:e(n.span,{class:"icon icon-link"})}),"Meta-framework guides"]}),`
`,e("div",{class:"flex flex-col gap-4 md:flex-row mx-6 lg:mx-8",children:[e("a",{class:"flex-1 border-none",href:"#qwik-city",children:e("span",{class:"p-8 rounded-base gap-4 flex flex-col items-center border transition duration-300 ease-step hover:bg-accent",children:[e(g,{class:"max-w-[100px] max-h-[100px]"}),e("span",{class:"text-lg font-bold",children:"Qwik City"})]})}),e("a",{class:"flex-1 border-none",href:"#astro",children:e("span",{class:"p-8 rounded-base gap-4 flex flex-col items-center border transition duration-300 ease-step hover:bg-accent",children:[e(w,{class:"max-w-[100px] max-h-[100px]"}),e("span",{class:"text-lg font-bold",children:"Astro"})]})})]}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building Blocks"]}),`
`,e(n.p,{children:["Each component includes a ",e(n.code,{children:"building blocks"})," section, which provides a barebones example of the component. This can be used as a starting point for implementing the component from scratch."]}),`
`,e(n.p,{children:["Below is an example of the ",e(n.code,{children:"Accordion"})," component's building block:"]}),`
`,e(d,{}),`
`,e(n.p,{children:"We will use this example as a Qwik UI component in each guide."}),`
`,e(n.h2,{id:"qwik-city",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#qwik-city",children:e(n.span,{class:"icon icon-link"})}),"Qwik City"]}),`
`,e(n.p,{children:"To create a Qwik city app, run the following command:"}),`
`,e(i,{packages:A}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["For a more in-depth installation, or if you'd like to use a different package manager, follow the guide in the ",e(n.a,{href:"https://qwik.builder.io/docs/getting-started/#create-an-app-using-the-cli",children:"Qwik docs"})]}),`
`]}),`
`,e(n.p,{children:["Let's select the ",e(n.code,{children:"empty app"})," option in the CLI to keep it simple. And remember, choosing the dad joke is not optional - it's mandatory! We have a highly sophisticated Dad Joke Detection System (DJDS) in place, so we'll know if you didn't!"]}),`
`,e("div",{class:"",children:e("img",{src:k,class:"block max-w-full rounded-base mb-6 border"})}),`
`,e(n.p,{children:["Below is the Qwik City project structure. Inside of the ",e(n.code,{children:"src"})," directory, let's create a new folder called ",e(n.code,{children:"accordion"}),". Then, a file named ",e(n.strong,{children:e(n.code,{children:"accordion.tsx"})})," inside of ",e(n.code,{children:"src/components"}),"."]}),`
`,e("div",{class:"whitespace-pre-wrap bg-secondary/20  px-5 py-4 lg:px-7 border border-secondary rounded-base mb-6 lg:mb-12",children:e(n.p,{children:[e("strong",{children:"Qwik City files"}),`
├─ .eslintignore
├─ .eslintrc.cjs
├─ .gitignore
├─ .prettierignore
├─ README.md
├─ package-lock.json
├─ package.json
├─ public
│  ├─ favicon.svg
│  ├─ manifest.json
│  └─ robots.txt
├─ `,e("strong",{children:"src"}),`
│  ├─ `,e("strong",{children:"components"}),`
│  │  └─ `,e("strong",{children:"accordion"}),`
│  │     └─ `,e("strong",{children:"accordion.tsx"}),`
│  │  └─ router-head
│  │     └─ router-head.tsx
│  ├─ entry.dev.tsx
│  ├─ entry.preview.tsx
│  ├─ entry.ssr.tsx
│  ├─ global.css
│  ├─ root.tsx
│  └─ routes
│     ├─ index.tsx
│     ├─ layout.tsx
│     └─ service-worker.ts
├─ tsconfig.json
└─ vite.config.ts`]})}),`
`,e(n.p,{children:"Now, to create a component, you can simply copy/paste the code from the building blocks section, or the snippet provided in the code tab below 👇"}),`
`,e(a,{}),`
`,e(n.p,{children:["Hooray! We've now added our ",e(n.strong,{children:"first"})," Qwik UI component in Qwik City. It includes a starting point where the accordion functionality and aria behavior is added for us."]}),`
`,e(u,{}),`
`,e(n.p,{children:["Let's add a few styles to make the component stand out more, we'll use ",e(n.code,{children:"Tailwind CSS"})," as a styling solution."]}),`
`,e(b,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["Here's a Qwik City ",e(n.a,{href:"https://github.com/thejackshelton/qwik-ui-scratch",children:"project example repository"})," with the content from above. Feel free to clone it and play with it."]}),`
`]}),`
`,e(n.h2,{id:"astro",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#astro",children:e(n.span,{class:"icon icon-link"})}),"Astro"]}),`
`,e(n.p,{children:"To set up an Astro application, add the following command in the terminal:"}),`
`,e(i,{packages:D}),`
`,e(n.p,{children:["Add a relative path for your project, and select the ",e(n.code,{children:"empty"})," option in the CLI."]}),`
`,e("div",{class:"",children:e("img",{src:y,class:"block max-w-full rounded-base mb-6 border"})}),`
`,e(n.p,{children:["Next, let's add the ",e(n.a,{href:"https://www.npmjs.com/package/@qwikdev/astro",children:"@qwikdev/astro"})," integration. This integration allows us to leverage resumability and Qwik components inside of Astro."]}),`
`,e(n.p,{children:"Run the following command in the terminal:"}),`
`,e(i,{packages:v}),`
`,e("div",{class:"",children:e("img",{src:f,class:"block max-w-full rounded-base mb-6 border"})}),`
`,e(n.p,{children:["Then, let's make sure we use Qwik as our main ",e(n.strong,{children:"jsxImportSource"})," in ",e(n.code,{children:"tsconfig.json"}),". Otherwise, it will not get the proper Qwik types."]}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`{
    "extends": "astro/tsconfigs/strict",
    "compilerOptions": {
        "jsx": "react-jsx",
        "jsxImportSource": "@builder.io/qwik"
    }
}`,children:e(n.code,{children:[e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"{"})}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:'    "'}),e(n.span,{style:{color:"#E4F0FB"},children:"extends"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:": "}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"astro/tsconfigs/strict"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:'    "'}),e(n.span,{style:{color:"#E4F0FB"},children:"compilerOptions"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:": {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:'        "'}),e(n.span,{style:{color:"#ADD7FF"},children:"jsx"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:": "}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"react-jsx"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:'        "'}),e(n.span,{style:{color:"#ADD7FF"},children:"jsxImportSource"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#A6ACCD"},children:": "}),e(n.span,{style:{color:"#A6ACCD"},children:'"'}),e(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),e(n.span,{style:{color:"#A6ACCD"},children:'"'})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,e("br",{}),`
`,e(n.p,{children:["Under the ",e(n.code,{children:"src"})," directory, let's create a folder called ",e(n.code,{children:"components"}),". Similar to the Qwik City guide, we'll create a folder named ",e(n.code,{children:"accordion"}),", and a file named ",e(n.strong,{children:e(n.code,{children:"accordion.tsx"})}),"."]}),`
`,e(n.p,{children:"Below is the project structure with this in place."}),`
`,e("div",{class:"whitespace-pre-wrap bg-secondary/20  px-5 py-4 lg:px-7 border border-secondary rounded-base mb-6 lg:mb-12",children:e(n.p,{children:[e("strong",{children:"Astro files"}),`
├─ .gitignore
├─ README.md
├─ astro.config.mjs
├─ package-lock.json
├─ package.json
├─ public
│  └─ favicon.svg
├─ src
│  ├─ env.d.ts
│  └─ pages
│     ├─ `,e("strong",{children:"components"}),`
│     │  └─ `,e("strong",{children:"accordion"}),`
│     │     └─ `,e("strong",{children:"accordion.tsx"}),`
│     └─ index.astro
└─ tsconfig.json`]})}),`
`,e(n.p,{children:["Once again, let's copy our ",e(n.code,{children:"building-blocks"})," example from above."]}),`
`,e(d,{}),`
`,e(a,{}),`
`,e(n.p,{children:"And we'll spice it up a bit using some vanilla CSS."}),`
`,e(x,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["Here's an Astro ",e(n.a,{href:"https://github.com/thejackshelton/qwik-ui-astro-scratch",children:"project example repository"})," with the content from above. Feel free to clone it and play with it."]}),`
`]})]})},"_createMdxContent_0",[]));function q(s,n,i){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/install/index.mdx: Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}const T=(s={})=>{const n=c(p,{children:c(_,s,3,null)},3,"CpBmukm_");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{D as astroPackages,T as default,B as frontmatter,S as head,L as headings,C as packages,v as qwikAstroCliPackages,A as qwikCityPackages};
