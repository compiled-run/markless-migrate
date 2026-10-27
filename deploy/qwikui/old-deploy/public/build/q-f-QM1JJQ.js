import{t as s,N as c,z as h,O as p,S as e,U as y,D as l}from"./q-CsvfasCP.js";import{u as C}from"./q-D_NppxYb.js";import{F as u}from"./q-BhbRZEaL.js";import{I as A}from"./q-5ka1W-dj.js";import{s as m}from"./q-BnEU7A_-.js";import{_ as a}from"./q-BKZ00VYc.js";const D=s(c(()=>a(()=>import("./q-C781672T.js"),[]),"s_yvHYXrMr2vY")),w=s(c(()=>a(()=>import("./q-DAWbY2M2.js"),[]),"s_DOydizANKes")),g=s(c(()=>a(()=>import("./q-DevtXZKu.js"),[]),"s_2jkL9c06BL0")),B=[{text:"Contributing",id:"contributing",level:1},{text:"There are two projects we currently work on:",id:"there-are-two-projects-we-currently-work-on",level:2},{text:"Qwik UI Headless",id:"qwik-ui-headless",level:3},{text:"Qwik UI Styled",id:"qwik-ui-styled",level:3},{text:"There's a lot of stuff here!",id:"theres-a-lot-of-stuff-here",level:2},{text:"What can I do?",id:"what-can-i-do",level:2},{text:"Headless",id:"headless",level:2},{text:"I don't know anything about accessibility, can I still contribute?",id:"i-dont-know-anything-about-accessibility-can-i-still-contribute",level:3},{text:"When is a headless component beta?",id:"when-is-a-headless-component-beta",level:2},{text:"Docs",id:"docs",level:2},{text:"Docs Components",id:"docs-components",level:3},{text:"Notes",id:"notes",level:3},{text:"API table",id:"api-table",level:3},{text:"Feature list",id:"feature-list",level:3},{text:"Component status banner",id:"component-status-banner",level:3},{text:"info popup (uses the popover)",id:"info-popup-uses-the-popover",level:3},{text:"Tests",id:"tests",level:2},{text:"TDD Process",id:"tdd-process",level:3},{text:"Getting started w/ testing",id:"getting-started-w-testing",level:3},{text:"What if I only want to do docs contributions, is that ok?",id:"what-if-i-only-want-to-do-docs-contributions-is-that-ok",level:3},{text:"Where should I learn the Qwik parts?",id:"where-should-i-learn-the-qwik-parts",level:2},{text:"What's something I should avoid?",id:"whats-something-i-should-avoid",level:3},{text:"How do I make a PR?",id:"how-do-i-make-a-pr",level:2},{text:"Inline Components for UI Libraries (proper indexes)",id:"inline-components-for-ui-libraries-proper-indexes",level:2},{text:"Why Use Inline Components?",id:"why-use-inline-components",level:3},{text:"How Inline Components Work",id:"how-inline-components-work",level:3},{text:"Adding an inline component",id:"adding-an-inline-component",level:3},{text:"DONT USE SLOTS",id:"dont-use-slots",level:4},{text:"How to use hooks and context?",id:"how-to-use-hooks-and-context",level:4},{text:"That's it!",id:"thats-it",level:2}],I={title:"Qwik UI - Contributing",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},T={title:"Qwik UI - Contributing"},b=s(y(o=>{const n={a:"a",blockquote:"blockquote",code:"code",del:"del",em:"em",h1:"h1",h2:"h2",h3:"h3",h4:"h4",li:"li",ol:"ol",p:"p",pre:"pre",span:"span",strong:"strong",ul:"ul",...C(),...o.components},{APITable:r,Note:i,StatusBanner:d}=n;return r||t("APITable"),i||t("Note"),d||t("StatusBanner"),e(l,{children:[e(n.h1,{id:"contributing",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#contributing",children:e(n.span,{class:"icon icon-link"})}),"Contributing"]}),`
`,e(n.p,{children:"Thinking about contributing to the project, but don't know where to start? You're in the right place!"}),`
`,e(n.p,{children:"We'll get you up in shape in no time, and ready to hop into the Qwik UI code cave."}),`
`,e("img",{width:1024,height:1024,src:"/images/contributing/code-cave.webp"}),`
`,e(n.h2,{id:"there-are-two-projects-we-currently-work-on",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#there-are-two-projects-we-currently-work-on",children:e(n.span,{class:"icon icon-link"})}),"There are ",e(n.strong,{children:"two projects"})," we currently work on:"]}),`
`,e(n.h3,{id:"qwik-ui-headless",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#qwik-ui-headless",children:e(n.span,{class:"icon icon-link"})}),"Qwik UI Headless"]}),`
`,e(n.p,{children:["Don't know what a headless library is? ",e(n.a,{href:"https://www.smashingmagazine.com/2022/05/you-dont-need-ui-framework/",children:"This might help"}),"."]}),`
`,e(n.h3,{id:"qwik-ui-styled",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#qwik-ui-styled",children:e(n.span,{class:"icon icon-link"})}),"Qwik UI Styled"]}),`
`,e(n.p,{children:["A styled copy-paste component ",e(n.del,{children:"library"})," collection built with TailwindCSS, cva and tailwind-merge - inspired by ",e(n.a,{href:"https://ui.shadcn.com/docs",children:"Shadcn"}),"."]}),`
`,e(n.h2,{id:"theres-a-lot-of-stuff-here",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#theres-a-lot-of-stuff-here",children:e(n.span,{class:"icon icon-link"})}),"There's a lot of stuff here!"]}),`
`,e(n.p,{children:["Yep, ",e(n.code,{children:"99%"})," of the time you're gonna be in two directories:"]}),`
`,e(n.p,{children:[e(n.strong,{children:"website"})," - ",e(n.code,{children:"apps/website"})," for the docs"]}),`
`,e(n.p,{children:[e(n.strong,{children:"packages"})," - ",e(n.code,{children:"packages/kit-headless"})," or ",e(n.code,{children:"packages/kit-styled"})]}),`
`,e(n.h2,{id:"what-can-i-do",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#what-can-i-do",children:e(n.span,{class:"icon icon-link"})}),e(n.strong,{children:"What can I do?"})]}),`
`,e(n.p,{children:"We welcome any sort of contributions, whether it's a new feature/component, bug fix, or documentation."}),`
`,e(n.p,{children:["Feel free to hang out on ",e(n.a,{href:"https://discord.gg/PVWUUejrez",children:"Discord"})," if you have a question, need help, or would like to help others."]}),`
`,e(n.h2,{id:"headless",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#headless",children:e(n.span,{class:"icon icon-link"})}),"Headless"]}),`
`,e(n.p,{children:["Check out the ",e(n.a,{href:"https://qwikui.com/docs/headless/introduction/",children:"introduction section"})," to see the principles of Qwik UI, and the project goals. As a heads up, those may change over time with more discussion!"]}),`
`,e(n.h3,{id:"i-dont-know-anything-about-accessibility-can-i-still-contribute",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#i-dont-know-anything-about-accessibility-can-i-still-contribute",children:e(n.span,{class:"icon icon-link"})}),"I don't know anything about accessibility, can I still contribute?"]}),`
`,e(n.p,{children:["Of course! Neither did we before starting this project. Our go-to resource is the ",e(n.a,{href:"https://www.w3.org/WAI/ARIA/apg/patterns/",children:"Aria Authoring Practices Guide"}),". Find the component you're going for, and read through the component guide."]}),`
`,e(i,{status:"warning",children:e(n.p,{children:[e(n.strong,{children:"Disclaimer"}),`: following the guide does not necessarily mean it's accessible, you can
think of it as a starting guide that'll get you 70% there. The only way to truly test is
with assistive technology, such as a `,e(n.strong,{children:"screenreader"}),"."]})}),`
`,e(n.p,{children:["We also have plenty of other ",e(n.a,{href:"https://discord.com/channels/990511757091033108/1114309494986506401/1114309494986506401",children:"accessibility resources"})," you can skim through. Feel free to ask questions!"]}),`
`,e(n.h2,{id:"when-is-a-headless-component-beta",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#when-is-a-headless-component-beta",children:e(n.span,{class:"icon icon-link"})}),"When is a headless component beta?"]}),`
`,e(n.p,{children:"It can be used for most common use cases, and maybe some advanced ones (if you'd like to go further)."}),`
`,e(n.p,{children:"A good place to start is look around the web and see how things work! What kind of features do other solutions have? Does someone already have a need for this in the Qwik community? How would I go about approaching this?"}),`
`,e(n.p,{children:"Feel free to take inspiration from awesome headless libraries in other communities. For example, like the popular headless libraries below:"}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:[e(n.a,{href:"https://react-spectrum.adobe.com/react-aria/components.html",children:"React Aria"})," is a React Headless library."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://www.radix-ui.com/primitives/docs/components/accordion",children:"Radix UI"})," is a React Headless library."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://melt-ui.com/docs/builders/accordion",children:"Melt UI"})," is a Svelte headless library."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://kobalte.dev/docs/core/components/accordion",children:"Kobalte"})," is a Solid JS headless library"]}),`
`,e(n.li,{children:[e(n.a,{href:"https://headlessui.com/",children:"Headless UI"})," is a React and Vue headless library."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://ark-ui.com/",children:"Ark UI"})," is a headless library that uses state machines."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://webeetle.github.io/react-headless-hooks/docs/useAccordion",children:"React Headless Hooks"})," is a hooks based headless library for React."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://www.downshift-js.com/",children:"Downshift"})," is a hooks based library for accessible comboboxes and select components."]}),`
`]}),`
`,e(n.p,{children:"Going through these projects can help with understanding the why and what problems they solve. What kinda features do all of them have in common? How do they name things? What conventions do they use? How satisfied are people consuming it?"}),`
`,e(n.p,{children:"It also helps to keep things simple, and not add features unless there is a demand for them (hence looking for similarities)."}),`
`,e(n.h2,{id:"docs",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#docs",children:e(n.span,{class:"icon icon-link"})}),"Docs"]}),`
`,e(n.p,{children:["Qwik UI uses ",e(n.a,{href:"https://mdxjs.com/docs/what-is-mdx/",children:"MDX"})," for interactive markdown."]}),`
`,e(n.p,{children:["Here is a quick link to the ",e(n.a,{href:"https://github.com/qwikifiers/qwik-ui/tree/main/apps/website/src/routes/docs/headless",children:"headless docs in github"}),"."]}),`
`,e(n.h3,{id:"docs-components",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#docs-components",children:e(n.span,{class:"icon icon-link"})}),"Docs Components"]}),`
`,e(n.p,{children:["There are more ",e(n.a,{href:"https://github.com/qwikifiers/qwik-ui/tree/main/apps/website/src/components",children:"docs components"})," to make your life easier! Some examples being:"]}),`
`,e(n.h3,{id:"notes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#notes",children:e(n.span,{class:"icon icon-link"})}),"Notes"]}),`
`,e(i,{children:"I am a note component!"}),`
`,e(n.h3,{id:"api-table",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#api-table",children:e(n.span,{class:"icon icon-link"})}),"API table"]}),`
`,e(r,{propDescriptors:[{name:"behavior",type:"string",description:"Determines whether the Accordion will open one or multiple items at a time."},{name:"onSelectedIndexChange$",type:"function",info:"PropFunction<(index: number) => void>",description:"An event hook that gets notified whenever the selected index changes."},{name:"onFocusIndexChange$",type:"function",info:"PropFunction<(index: number) => void>",description:"An event hook that gets notified whenever the focus index changes."}]}),`
`,e(n.h3,{id:"feature-list",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#feature-list",children:e(n.span,{class:"icon icon-link"})}),"Feature list"]}),`
`,e(u,{features:["feature A","feature B"]}),`
`,e(n.h3,{id:"component-status-banner",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#component-status-banner",children:e(n.span,{class:"icon icon-link"})}),"Component status banner"]}),`
`,e(d,{status:m.headless.Collapsible}),`
`,e(n.h3,{id:"info-popup-uses-the-popover",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#info-popup-uses-the-popover",children:e(n.span,{class:"icon icon-link"})}),"info popup (uses the popover)"]}),`
`,e(A,{info:"Some info!"}),`
`,e(n.h2,{id:"tests",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tests",children:e(n.span,{class:"icon icon-link"})}),"Tests"]}),`
`,e(n.p,{children:["Tests ensure we can sleep sound at night and know that our component behavior is working as intended. Part of the Qwik core team, Shai Reznik (and also a contributor here!) talks a lot about ",e(n.a,{href:"https://www.youtube.com/watch?v=KHaeVaSkhIE",children:"test driven development"}),"."]}),`
`,e(n.h3,{id:"tdd-process",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tdd-process",children:e(n.span,{class:"icon icon-link"})}),"TDD Process"]}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:"we need a new feature!"}),`
`,e(n.li,{children:"make a failing test with the desired behavior (wut?)"}),`
`,e(n.li,{children:"get the test passing by adding said feature!"}),`
`,e(n.li,{children:"enjoy life when refactoring 🏝️"}),`
`]}),`
`,e(n.p,{children:"We strongly recommend TDD development for the headless library."}),`
`,e(n.p,{children:[e(n.a,{href:"https://playwright.dev/",children:"Playwright"})," is the tool that is used for component testing."]}),`
`,e(n.h3,{id:"getting-started-w-testing",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#getting-started-w-testing",children:e(n.span,{class:"icon icon-link"})}),"Getting started w/ testing"]}),`
`,e(n.p,{children:"We use the components showcased in the docs to test the headless library. Let's create a new example to test:"}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { component$ } from '@builder.io/qwik';
import { Collapsible } from '@qwik-ui/headless';

export default component$(() => {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger>Trigger</Collapsible.Trigger>
      <Collapsible.Content>Content</Collapsible.Content>
    </Collapsible.Root>
  );
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" component$"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@builder.io/qwik"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" Collapsible"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@qwik-ui/headless"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"export default "}),e(n.span,{style:{color:"#E4F0FBD0"},children:"component$"}),e(n.span,{style:{color:"#A6ACCD"},children:"(()"}),e(n.span,{style:{color:"#91B4D5"},children:" =>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Root"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Trigger"}),e(n.span,{style:{color:"#E4F0FB"},children:">Trigger</"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Trigger"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Content"}),e(n.span,{style:{color:"#E4F0FB"},children:">Content</"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Content"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    </"}),e(n.span,{style:{color:"#5DE4C7"},children:"Collapsible.Root"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.p,{children:'Each headless component also needs a "driver file", or the reusable component pieces we will need throughout the test.'}),`
`,e(n.p,{children:["In the headless folder, create a new file with the convention of ",e(n.code,{children:"<component-name>.driver.tsx"}),"."]}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { Locator, Page } from '@playwright/test';
export type DriverLocator = Locator | Page;

export function createTestDriver<T extends DriverLocator>(rootLocator: T) {
  const getRoot = () => {
    return rootLocator.locator('[data-collapsible]');
  };

  const getTrigger = () => {
    return getRoot().getByRole('button');
  };

  const getContent = () => {
    return getRoot().locator('[data-collapsible-content]');
  };

  return {
    ...rootLocator,
    locator: rootLocator,
    getRoot,
    getTrigger,
    getContent,
  };
}`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" Locator"}),e(n.span,{style:{color:"#A6ACCD"},children:","}),e(n.span,{style:{color:"#ADD7FF"},children:" Page"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@playwright/test"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"export"}),e(n.span,{style:{color:"#91B4D5"},children:" type"}),e(n.span,{style:{color:"#A6ACCD"},children:" DriverLocator"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCDC0"},children:" Locator"}),e(n.span,{style:{color:"#91B4D5"},children:" |"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" Page"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"export"}),e(n.span,{style:{color:"#91B4D5"},children:" function"}),e(n.span,{style:{color:"#ADD7FF"},children:" createTestDriver"}),e(n.span,{style:{color:"#A6ACCD"},children:"<"}),e(n.span,{style:{color:"#A6ACCDC0"},children:"T"}),e(n.span,{style:{color:"#5DE4C7"},children:" extends"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" DriverLocator"}),e(n.span,{style:{color:"#A6ACCD"},children:">("}),e(n.span,{style:{color:"#E4F0FB"},children:"rootLocator"}),e(n.span,{style:{color:"#91B4D5"},children:":"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" T"}),e(n.span,{style:{color:"#A6ACCD"},children:") {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  const"}),e(n.span,{style:{color:"#ADD7FF"},children:" getRoot"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCD"},children:" () "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"    return"}),e(n.span,{style:{color:"#E4F0FB"},children:" rootLocator"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"locator"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"[data-collapsible]"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  const"}),e(n.span,{style:{color:"#ADD7FF"},children:" getTrigger"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCD"},children:" () "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"    return"}),e(n.span,{style:{color:"#E4F0FBD0"},children:" getRoot"}),e(n.span,{style:{color:"#A6ACCD"},children:"()."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"getByRole"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"button"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  const"}),e(n.span,{style:{color:"#ADD7FF"},children:" getContent"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCD"},children:" () "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"    return"}),e(n.span,{style:{color:"#E4F0FBD0"},children:" getRoot"}),e(n.span,{style:{color:"#A6ACCD"},children:"()."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"locator"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"[data-collapsible-content]"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"    ..."}),e(n.span,{style:{color:"#E4F0FB"},children:"rootLocator"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#ADD7FF"},children:"    locator"}),e(n.span,{style:{color:"#A6ACCD"},children:":"}),e(n.span,{style:{color:"#E4F0FB"},children:" rootLocator"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    getRoot"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    getTrigger"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    getContent"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"}"})})]})})}),`
`,e(n.p,{children:"Above we are getting the collapsible root, trigger, and content."}),`
`,e(n.p,{children:"Now, these pieces can be used in our test file:"}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`import { expect, test, type Page } from '@playwright/test';
import { createTestDriver } from './collapsible.driver';

async function setup(page: Page, exampleName: string) {
  await page.goto(\`headless/collapsible/\${exampleName}\`);

  const driver = createTestDriver(page);

  return {
    driver,
  };
}

test.describe('Mouse Behavior', () => {
  test(\`GIVEN a collapsible
          WHEN clicking on the trigger
          THEN the content should be visible\`, async ({ page }) => {
    const { driver: d } = await setup(page, 'hero');

    await d.getTrigger().click();
    await expect(d.getContent()).toBeVisible();
  });
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" expect"}),e(n.span,{style:{color:"#A6ACCD"},children:","}),e(n.span,{style:{color:"#ADD7FF"},children:" test"}),e(n.span,{style:{color:"#A6ACCD"},children:","}),e(n.span,{style:{color:"#A6ACCD"},children:" type"}),e(n.span,{style:{color:"#ADD7FF"},children:" Page"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"@playwright/test"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"import "}),e(n.span,{style:{color:"#A6ACCD"},children:"{"}),e(n.span,{style:{color:"#ADD7FF"},children:" createTestDriver"}),e(n.span,{style:{color:"#A6ACCD"},children:" }"}),e(n.span,{style:{color:"#A6ACCD"},children:" from"}),e(n.span,{style:{color:"#A6ACCD"},children:" '"}),e(n.span,{style:{color:"#5DE4C7"},children:"./collapsible.driver"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"async"}),e(n.span,{style:{color:"#91B4D5"},children:" function"}),e(n.span,{style:{color:"#ADD7FF"},children:" setup"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#E4F0FB"},children:"page"}),e(n.span,{style:{color:"#91B4D5"},children:":"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" Page"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#E4F0FB"},children:"exampleName"}),e(n.span,{style:{color:"#91B4D5"},children:":"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" string"}),e(n.span,{style:{color:"#A6ACCD"},children:") {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  await"}),e(n.span,{style:{color:"#E4F0FB"},children:" page"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"goto"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"`"}),e(n.span,{style:{color:"#5DE4C7"},children:"headless/collapsible/"}),e(n.span,{style:{color:"#A6ACCD"},children:"${"}),e(n.span,{style:{color:"#E4F0FB"},children:"exampleName"}),e(n.span,{style:{color:"#A6ACCD"},children:"}`"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  const"}),e(n.span,{style:{color:"#E4F0FB"},children:" driver"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#E4F0FBD0"},children:" createTestDriver"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#E4F0FB"},children:"page"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    driver"}),e(n.span,{style:{color:"#A6ACCD"},children:","})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"}"})}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"test"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"describe"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"Mouse Behavior"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:", () "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"  test"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"`"}),e(n.span,{style:{color:"#5DE4C7"},children:"GIVEN a collapsible"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#5DE4C7"},children:"          WHEN clicking on the trigger"})}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"          THEN the content should be visible"}),e(n.span,{style:{color:"#A6ACCD"},children:"`"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#5DE4C7"},children:"async"}),e(n.span,{style:{color:"#A6ACCD"},children:" ({ "}),e(n.span,{style:{color:"#E4F0FB"},children:"page"}),e(n.span,{style:{color:"#A6ACCD"},children:" }) "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"    const"}),e(n.span,{style:{color:"#A6ACCD"},children:" { driver: "}),e(n.span,{style:{color:"#E4F0FB"},children:"d"}),e(n.span,{style:{color:"#A6ACCD"},children:" } "}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#5DE4C7C0"},children:" await"}),e(n.span,{style:{color:"#E4F0FBD0"},children:" setup"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#E4F0FB"},children:"page"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"hero"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"    await"}),e(n.span,{style:{color:"#E4F0FB"},children:" d"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"getTrigger"}),e(n.span,{style:{color:"#A6ACCD"},children:"()."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"click"}),e(n.span,{style:{color:"#A6ACCD"},children:"();"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"    await"}),e(n.span,{style:{color:"#E4F0FBD0"},children:" expect"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#E4F0FB"},children:"d"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"getContent"}),e(n.span,{style:{color:"#A6ACCD"},children:"())."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"toBeVisible"}),e(n.span,{style:{color:"#A6ACCD"},children:"();"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  });"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.p,{children:"Notice that we passed the hero example to our setup function for this test."}),`
`,e(n.p,{children:["To run the tests, use the ",e(n.code,{children:"pnpm test.pw.headless --ui"})," command."]}),`
`,e(n.p,{children:"Once the test is failing with the intended playwright commands, it's a good time to implement the feature for that!"}),`
`,e(n.h3,{id:"what-if-i-only-want-to-do-docs-contributions-is-that-ok",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#what-if-i-only-want-to-do-docs-contributions-is-that-ok",children:e(n.span,{class:"icon icon-link"})}),e(n.strong,{children:"What if I only want to do docs contributions, is that ok?"})]}),`
`,e(n.p,{children:["Absolutely, documentation is a critical part of the project, and something that can be very much improved! I recommend checking out ",e(n.a,{href:"https://contribute.docs.astro.build/welcome/",children:"Sarah Rainsberg's Docs Guide"}),", it's partly towards Astro, but is also a great general resource for writing good documentation."]}),`
`,e(n.h2,{id:"where-should-i-learn-the-qwik-parts",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#where-should-i-learn-the-qwik-parts",children:e(n.span,{class:"icon icon-link"})}),"Where should I learn the Qwik parts?"]}),`
`,e(n.p,{children:["If you find yourself stuck on a certain pattern, try taking a look through Qwik UI stable components. For example, the ",e(n.a,{href:"https://github.com/qwikifiers/qwik-ui/tree/main/packages/kit-headless/src/components/collapsible",children:"collapsible component"}),"."]}),`
`,e(n.h3,{id:"whats-something-i-should-avoid",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#whats-something-i-should-avoid",children:e(n.span,{class:"icon icon-link"})}),"What's something I should avoid?"]}),`
`,e(n.p,{children:[e(n.a,{href:"https://qwik.dev/docs/guides/best-practices/#use-usevisibletask-as-a-last-resort",children:"useVisibleTask$"}),". It's an escape hatch, and for 95% of UI components I can promise you that it's not needed."]}),`
`,e(n.p,{children:`You're pretty much saying "hey Qwik! All those benefits you do to lazy load and delay the execution of code? Let's throw those away".`}),`
`,e(n.p,{children:"When building headless functionality, it's important to ask yourself:"}),`
`,e(n.p,{children:["Where does my user interact with things? And how can I make sure that we can ",e(n.em,{children:"delay"})," the execution of that code until the user ABSOLUTELY needs it."]}),`
`,e(n.p,{children:["Here's a code example I've seen in the Qwik discord. The developer is trying to make sure that an open menu navbar is closed when the window is resized over ",e(n.code,{children:"1248px"})]}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`useVisibleTask$(({ cleanup }) => {
  const updateDocumentClass = () => {
    if (menuOpen.value && window.innerWidth > 1248) {
      menuOpen.value = false;
      document.documentElement.classList.remove('modal-open');
    }
  };

  window.addEventListener('resize', updateDocumentClass);

  cleanup(() => {
    window.removeEventListener('resize', updateDocumentClass);
  });
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"useVisibleTask$"}),e(n.span,{style:{color:"#A6ACCD"},children:"(({ "}),e(n.span,{style:{color:"#E4F0FB"},children:"cleanup"}),e(n.span,{style:{color:"#A6ACCD"},children:" }) "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"  const"}),e(n.span,{style:{color:"#ADD7FF"},children:" updateDocumentClass"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCD"},children:" () "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"    if ("}),e(n.span,{style:{color:"#E4F0FB"},children:"menuOpen"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#91B4D5"},children:" &&"}),e(n.span,{style:{color:"#E4F0FB"},children:" window"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"innerWidth"}),e(n.span,{style:{color:"#91B4D5"},children:" >"}),e(n.span,{style:{color:"#5DE4C7"},children:" 1248"}),e(n.span,{style:{color:"#A6ACCD"},children:") {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      menuOpen"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#D0679D"},children:" false"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      document"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"documentElement"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"classList"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"remove"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"modal-open"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"    }"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  };"})}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"  window"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"addEventListener"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"resize"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#E4F0FB"},children:"updateDocumentClass"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"  cleanup"}),e(n.span,{style:{color:"#A6ACCD"},children:"(() "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    window"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"removeEventListener"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"resize"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#E4F0FB"},children:"updateDocumentClass"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  });"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.p,{children:"Because this code is directly tied to an event, the same result could be achieved with:"}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`useOnWindow('resize', $(() => {
  if (menuOpen.value && window.innerWidth > 1248) {
    menuOpen.value = false;
    document.documentElement.classList.remove('modal-open');
  }
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FBD0"},children:"useOnWindow"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"resize"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:", "}),e(n.span,{style:{color:"#E4F0FBD0"},children:"$"}),e(n.span,{style:{color:"#A6ACCD"},children:"(() "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#A6ACCD"},children:"  if ("}),e(n.span,{style:{color:"#E4F0FB"},children:"menuOpen"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#91B4D5"},children:" &&"}),e(n.span,{style:{color:"#E4F0FB"},children:" window"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"innerWidth"}),e(n.span,{style:{color:"#91B4D5"},children:" >"}),e(n.span,{style:{color:"#5DE4C7"},children:" 1248"}),e(n.span,{style:{color:"#A6ACCD"},children:") {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    menuOpen"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"value"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#D0679D"},children:" false"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    document"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"documentElement"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"classList"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FBD0"},children:"remove"}),e(n.span,{style:{color:"#A6ACCD"},children:"("}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#5DE4C7"},children:"modal-open"}),e(n.span,{style:{color:"#A6ACCD"},children:"'"}),e(n.span,{style:{color:"#A6ACCD"},children:");"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  }"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.p,{children:["Creating ui elements gets easier once you have a clear mental model for API's like ",e(n.code,{children:"useTask$"}),". Here are some alternatives to explore over useVisibleTask$."]}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:[e(n.a,{href:"https://qwik.dev/docs/components/events/#events",children:"Events"})," - onClick$, onScroll$, onKeydown$"]}),`
`,e(n.li,{children:[e(n.a,{href:"https://qwik.dev/docs/components/tasks/#usetask",children:"useTask$"})," - (running code initially on server, tracked change on client)"]}),`
`,e(n.li,{children:[e(n.a,{href:"https://qwik.dev/docs/components/state/#usecomputed",children:"useComputed$"})," - deriving state synchronously"]}),`
`,e(n.li,{children:[e(n.a,{href:"https://github.com/thejackshelton/astro-qwik-global-state-example/blob/main/src/components/counter.tsx",children:"Custom Events"}),". Check out ",e(n.code,{children:"random-island.tsx"})," too."]}),`
`,e(n.li,{children:[e(n.a,{href:"https://qwik.dev/docs/cookbook/sync-events/#sync-synchronous-events-beta",children:"sync$"}),` - perform some browser work
ex: preventDefault w/ onKeyDown$, localStorage`]}),`
`,e(n.li,{children:[e(n.a,{href:"https://qwik.dev/docs/components/tasks/#usevisibletask",children:"useVisibleTask$"})," (the last resort)"]}),`
`]}),`
`,e(n.p,{children:"We want to squeeze as much possible performance out of Qwik, and stay with the principle that things execute on interaction. This allows consumers to have a fast app without even trying!"}),`
`,e(n.h2,{id:"how-do-i-make-a-pr",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#how-do-i-make-a-pr",children:e(n.span,{class:"icon icon-link"})}),"How do I make a PR?"]}),`
`,e(n.p,{children:["We cover it in-depth in the ",e(n.a,{href:"https://github.com/qwikifiers/qwik-ui/blob/main/CONTRIBUTING.md",children:"contributing guide"})," here."]}),`
`,e(n.h2,{id:"inline-components-for-ui-libraries-proper-indexes",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#inline-components-for-ui-libraries-proper-indexes",children:e(n.span,{class:"icon icon-link"})}),"Inline Components for UI Libraries (proper indexes)"]}),`
`,e(n.p,{children:"Inline components play a crucial role in Qwik, especially when building headless UI libraries. They help solve unique challenges related to Qwik's resumable architecture and asynchronous rendering capabilities."}),`
`,e(n.h3,{id:"why-use-inline-components",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#why-use-inline-components",children:e(n.span,{class:"icon icon-link"})}),"Why Use Inline Components?"]}),`
`,e(n.p,{children:[e(n.strong,{children:"TLDR"}),": Inline components can look into the children and get the proper index, pass data, or make certain API decisions."]}),`
`,e(n.p,{children:"A more detailed explanation:"}),`
`,e(n.p,{children:"In client-side rendered environments, such as dashboards, Qwik components can render asynchronously and even out of order."}),`
`,e(D,{}),`
`,e(n.p,{children:"The above demonstrates the problem. The conditional JSX added is rendered on the client when the button is clicked, and the items are not rendered in the correct order."}),`
`,e(n.p,{children:"By contrast, when it is rendered on the server, we get the expected order."}),`
`,e(g,{}),`
`,e(n.p,{children:"This has to do with the entrypoints of the application. The current and previous generation of frameworks execute from the root entrypoint down in a tree-like structure, which is O(n) complexity."}),`
`,e(n.p,{children:["Qwik components execute based on interactions, each interactive piece is a possible entry point of the application. This means that Qwik components can render asynchronously and even out of order. Manu Almeida covers these ",e(n.a,{href:"https://www.builder.io/blog/hydration-tree-resumability-map",children:"data structures in relations to frameworks in-depth"}),"."]}),`
`,e(n.p,{children:"While resumability and javascript streaming offer substantial benefits, it poses a challenge when you need to maintain a specific order or index for child components when in a CSR environment."}),`
`,e(n.p,{children:[e(n.a,{href:"https://qwik.dev/docs/components/overview/#inline-components",children:"Inline components"})," help address this by:"]}),`
`,e(n.ol,{children:[`
`,e(n.li,{children:"Ensuring proper indexing of child components"}),`
`,e(n.li,{children:"Creating boundaries for bundling related code"}),`
`,e(n.li,{children:"Providing a way to process children before rendering, and while QRL's are being resolved"}),`
`]}),`
`,e(n.h3,{id:"how-inline-components-work",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#how-inline-components-work",children:e(n.span,{class:"icon icon-link"})}),"How Inline Components Work"]}),`
`,e(n.p,{children:["Unlike regular Qwik components defined with ",e(n.code,{children:"component$()"}),", inline components:"]}),`
`,e(n.ul,{children:[`
`,e(n.li,{children:"Are declared as standard functions"}),`
`,e(n.li,{children:["Cannot use ",e(n.code,{children:"use*"})," methods (e.g., ",e(n.code,{children:"useSignal"}),", ",e(n.code,{children:"useStore"}),")"]}),`
`,e(n.li,{children:["Cannot project content with ",e(n.code,{children:"<Slot>"})]}),`
`,e(n.li,{children:"Are bundled with their parent component"}),`
`]}),`
`,e(n.p,{children:"Inline components should be used with caution. They are called inline because they are defined inline with the parent component. This means that they are bundled with the parent component, which can lead to performance issues if used excessively."}),`
`,e(n.p,{children:"In our case, the tradeoff is negligible, but it's something to keep in mind."}),`
`,e(n.h3,{id:"adding-an-inline-component",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#adding-an-inline-component",children:e(n.span,{class:"icon icon-link"})}),"Adding an inline component"]}),`
`,e(n.p,{children:"To use an inline component, create a standard function that returns JSX. In the below example, the inline component is called ExampleRoot."}),`
`,e(w,{}),`
`,e(n.p,{children:"The root component uses two utilities from Qwik UI."}),`
`,e(n.p,{children:["One is ",e(n.code,{children:"findComponent"}),", which expects the component to be found as the first argument, and a callback function with the component's props as the second argument. The logic in this callback function is executed when the component is found."]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:["findComponent can be used to find any children of our root. If we wanted to execute logic based on the existence of a new component called ",e(n.code,{children:"<Toggle />"})," we could use ",e(n.code,{children:"findComponent(Toggle, () => {})"}),"."]}),`
`]}),`
`,e(n.p,{children:["The other utility is ",e(n.code,{children:"processChildren"}),`, which allows us to search through the children of an inline component for the "outer shell" we're looking for.`]}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:"processChildren should only be called once per inline component."}),`
`]}),`
`,e(n.p,{children:["The prop ",e(n.code,{children:"_index"})," contains an underscore to emphasize that it is an internal prop. Notice how ",e(n.code,{children:"_index"})," is consumed in the child Item component."]}),`
`,e(n.h4,{id:"dont-use-slots",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#dont-use-slots",children:e(n.span,{class:"icon icon-link"})}),"DONT USE SLOTS"]}),`
`,e(n.p,{children:["Notice how ",e(n.code,{children:"<ExampleRoot />"})," returns a ",e(n.code,{children:"children"})," prop. This is because inline components are able to look at children. Rather than passing a slot in an inline component, the children prop should be passed to the component's return function."]}),`
`,e(n.h4,{id:"how-to-use-hooks-and-context",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#how-to-use-hooks-and-context",children:e(n.span,{class:"icon icon-link"})}),"How to use hooks and context?"]}),`
`,e(n.p,{children:["Context and hooks is still easy to use, create a new component called ",e(n.code,{children:"<ExampleBase />"})," and return that instead of the div (with the children passed between) in the example above. From there, you can use context, hooks, and all the other Qwik goodies as a top level component."]}),`
`,e(l,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`return <ExampleBase>{props.children}</ExampleBase>;

// use hooks, context, and other stuff here!
export const ExampleBase = component$(() => {
  return (
    <div>
      <Slot />
    </div>
  );
});`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"return"}),e(n.span,{style:{color:"#E4F0FB"},children:" <"}),e(n.span,{style:{color:"#5DE4C7"},children:"ExampleBase"}),e(n.span,{style:{color:"#E4F0FB"},children:">{props"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"children}</"}),e(n.span,{style:{color:"#5DE4C7"},children:"ExampleBase"}),e(n.span,{style:{color:"#E4F0FB"},children:">"}),e(n.span,{style:{color:"#A6ACCD"},children:";"})]}),`
`,e(n.span,{class:"line"}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#767C9DB0",fontStyle:"italic"},children:"// use hooks, context, and other stuff here!"})}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7"},children:"export"}),e(n.span,{style:{color:"#91B4D5"},children:" const"}),e(n.span,{style:{color:"#E4F0FB"},children:" ExampleBase"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#E4F0FBD0"},children:" component$"}),e(n.span,{style:{color:"#A6ACCD"},children:"(() "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" {"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#5DE4C7C0"},children:"  return"}),e(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    <"}),e(n.span,{style:{color:"#5DE4C7"},children:"div"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"      <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Slot"}),e(n.span,{style:{color:"#E4F0FB"},children:" />"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    </"}),e(n.span,{style:{color:"#5DE4C7"},children:"div"}),e(n.span,{style:{color:"#E4F0FB"},children:">"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"  );"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:"});"})})]})})}),`
`,e(n.h2,{id:"thats-it",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#thats-it",children:e(n.span,{class:"icon icon-link"})}),"That's it!"]}),`
`,e(n.p,{children:"Hopefully you should have enough to get up and running with Qwik UI Headless, if you have any questions don't let us stop you from reaching out, and happy building :qwik:"}),`
`,e(n.p,{children:"If you'd like to work on the styled library that's entirely a possibility too, there's currently documentation on the headless is all."})]})},"_createMdxContent_0",[]));function t(o,n,r){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/contributing/index.mdx: Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}const S=(o={})=>{const n=h(p,{children:h(b,o,3,null)},3,"Voh1nRdA");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{S as default,T as frontmatter,I as head,B as headings};
