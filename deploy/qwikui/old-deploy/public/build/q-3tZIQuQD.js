import{t,N as i,z as h,O as b,S as e,U as u,D as p}from"./q-CsvfasCP.js";import{u as m}from"./q-D_NppxYb.js";import{s as y}from"./q-BnEU7A_-.js";import{_ as a}from"./q-BKZ00VYc.js";const f=t(i(()=>a(()=>import("./q-CxijsbAZ.js"),[]),"s_O8J01lSuY1Y")),v=t(i(()=>a(()=>import("./q-DnSRweLa.js"),[]),"s_DCFsd20Uf0M")),T=t(i(()=>a(()=>import("./q-CVVjqpFc.js"),[]),"s_NqLgu6uXMBM")),_=t(i(()=>a(()=>import("./q-D732ZpZQ.js"),[]),"s_DibrY9rS8Cg")),x=t(i(()=>a(()=>import("./q-DwIsKHK6.js"),[]),"s_4KcXErlTnlQ")),g=t(i(()=>a(()=>import("./q-DrSyDlRu.js"),[]),"s_W6oGpT9AWr8")),k=t(i(()=>a(()=>import("./q-Cv5smW0M.js"),[]),"s_gh0I0pzhln8")),w=t(i(()=>a(()=>import("./q-CDLVyqpb.js"),[]),"s_I5XhckYWBw4")),C=t(i(()=>a(()=>import("./q-BqptZFPR.js"),[]),"s_ijoCsNGVhDc")),D=t(i(()=>a(()=>import("./q-7shelPwX.js"),[]),"s_mWCFjl35pfQ")),I=t(i(()=>a(()=>import("./q-Bcx6hy6I.js"),[]),"s_0xHGZVNbEcA")),A=t(i(()=>a(()=>import("./q-YlKpcoDQ.js"),[]),"s_RwP3X4VCZD8")),E=t(i(()=>a(()=>import("./q-Cu2rVnca.js"),[]),"s_deaNDWRDU2w")),R=[{text:"Tabs",id:"tabs",level:1},{text:"Building blocks",id:"building-blocks",level:2},{text:"The full version",id:"the-full-version",level:3},{text:"The short version",id:"the-short-version",level:3},{text:"Vertical",id:"vertical",level:2},{text:"Disabled",id:"disabled",level:2},{text:"Behavior",id:"behavior",level:2},{text:"Automatic",id:"automatic",level:3},{text:"Manual",id:"manual",level:3},{text:"Dynamic",id:"dynamic",level:2},{text:"onSelectedIndexChange$",id:"onselectedindexchange",level:2},{text:"bind:selectedIndex",id:"bindselectedindex",level:2},{text:"bind:selectedTabId",id:"bindselectedtabid",level:2},{text:'Add a "selected" prop',id:"add-a-selected-prop",level:2},{text:"onClick$",id:"onclick",level:2},{text:"Creating reusable Tabs",id:"creating-reusable-tabs",level:2},{text:"Accessibility",id:"accessibility",level:2},{text:"Keyboard interaction",id:"keyboard-interaction",level:3},{text:"API",id:"api",level:2},{text:"Tabs",id:"tabs-1",level:3},{text:"Tab",id:"tab",level:3},{text:"Tabs.Panel",id:"tabspanel",level:3}],M={title:"Qwik UI | Tabs",meta:[],styles:[],links:[],scripts:[],frontmatter:{}},O={title:"Qwik UI | Tabs"},S=t(u(o=>{const n={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",h3:"h3",p:"p",pre:"pre",span:"span",...m(),...o.components},{APITable:s,KeyboardInteractionTable:c,Note:r,StatusBanner:d}=n;return s||l("APITable"),c||l("KeyboardInteractionTable"),r||l("Note"),d||l("StatusBanner"),e(p,{children:[e(d,{status:y.headless.Tabs}),`
`,e(n.h1,{id:"tabs",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tabs",children:e(n.span,{class:"icon icon-link"})}),"Tabs"]}),`
`,e(n.p,{children:"Explore and switch between different views using tabs"}),`
`,e(f,{}),`
`,e(n.h2,{id:"building-blocks",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#building-blocks",children:e(n.span,{class:"icon icon-link"})}),"Building blocks"]}),`
`,e(n.h3,{id:"the-full-version",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#the-full-version",children:e(n.span,{class:"icon icon-link"})}),"The full version"]}),`
`,e(A,{}),`
`,e(n.h3,{id:"the-short-version",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#the-short-version",children:e(n.span,{class:"icon icon-link"})}),"The short version"]}),`
`,e(E,{}),`
`,e(n.blockquote,{children:[`
`,e(n.p,{children:'The "short version" 👆 will be automatically transformed into the full ARIA compliant version'}),`
`]}),`
`,e(n.h2,{id:"vertical",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#vertical",children:e(n.span,{class:"icon icon-link"})}),"Vertical"]}),`
`,e(n.p,{children:["by default, the tabs are horizontal, but you can adjust the underlying behavior to be vertical by setting the ",e(n.code,{children:"vertical"})," prop to true."]}),`
`,e(v,{}),`
`,e(n.h2,{id:"disabled",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#disabled",children:e(n.span,{class:"icon icon-link"})}),"Disabled"]}),`
`,e(n.p,{children:["You can disable a tab by setting the ",e(n.code,{children:"disabled"})," prop to true."]}),`
`,e(T,{}),`
`,e(n.h2,{id:"behavior",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#behavior",children:e(n.span,{class:"icon icon-link"})}),"Behavior"]}),`
`,e(n.h3,{id:"automatic",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#automatic",children:e(n.span,{class:"icon icon-link"})}),"Automatic"]}),`
`,e(n.p,{children:["The default behavior of the tabs is manual, which means that the tabs will automatically switch to the next tab when the user hovers over the tab. You can change this behavior by setting the ",e(n.code,{children:"behavior"})," prop to ",e(n.code,{children:"automatic"}),"."]}),`
`,e(_,{}),`
`,e(n.h3,{id:"manual",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#manual",children:e(n.span,{class:"icon icon-link"})}),"Manual"]}),`
`,e(n.p,{children:"You can set the behavior to manual, which means that the tabs will not automatically switch to the next tab when the user presses the right arrow key, and to the previous tab when the user presses the left arrow key."}),`
`,e(x,{}),`
`,e(n.h2,{id:"dynamic",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#dynamic",children:e(n.span,{class:"icon icon-link"})}),"Dynamic"]}),`
`,e(g,{}),`
`,e(n.h2,{id:"onselectedindexchange",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#onselectedindexchange",children:e(n.span,{class:"icon icon-link"})}),"onSelectedIndexChange$"]}),`
`,e(n.p,{children:["You can listen to changes in the selected index by subscribing to the ",e(n.code,{children:"onSelectedIndexChange$"})," store."]}),`
`,e(k,{}),`
`,e(n.h2,{id:"bindselectedindex",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#bindselectedindex",children:e(n.span,{class:"icon icon-link"})}),"bind:selectedIndex"]}),`
`,e(n.p,{children:["You can provide a signal for the selected index with the ",e(n.code,{children:"bind:selectedIndex={yourSignal}"})," and it will be used directly. This is a more efficient version of ",e(n.code,{children:"onSelectedIndexChange$"}),"."]}),`
`,e(n.h2,{id:"bindselectedtabid",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#bindselectedtabid",children:e(n.span,{class:"icon icon-link"})}),"bind:selectedTabId"]}),`
`,e(n.p,{children:["You can provide a signal for the selected tab id with the ",e(n.code,{children:"bind:selectedTabId={yourSignal}"}),`
and it will be used directly.`]}),`
`,e(n.p,{children:["💡 You can manually set the ",e(n.code,{children:"tabId"})," prop on each tab to be able to select any tab by its ID."]}),`
`,e(w,{}),`
`,e(n.h2,{id:"add-a-selected-prop",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#add-a-selected-prop",children:e(n.span,{class:"icon icon-link"})}),'Add a "selected" prop']}),`
`,e(n.p,{children:'You can add a "selected" prop to the Tab component to make it selected by default.'}),`
`,e(C,{}),`
`,e(n.h2,{id:"onclick",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#onclick",children:e(n.span,{class:"icon icon-link"})}),"onClick$"]}),`
`,e(n.p,{children:["You can pass a custom ",e(n.code,{children:"onClick$"})," handler."]}),`
`,e(D,{}),`
`,e(n.h2,{id:"creating-reusable-tabs",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#creating-reusable-tabs",children:e(n.span,{class:"icon icon-link"})}),"Creating reusable Tabs"]}),`
`,e(n.p,{children:["In order to remove the need for a linking ",e(n.code,{children:"value"})," prop for each Tab and Tabs.Panel pair, we have chosen to create the Tabs component as an ",e(n.a,{href:"https://qwik.builder.io/docs/components/overview/#inline-components",children:"inline component"}),"."]}),`
`,e(n.p,{children:["By consequence, the Tabs component needs to be aware of its children. If you want to create your custom reusable Tabs.List/Tab/Tabs.Panel components, you will have to pass them to the Tabs component through its ",e(n.code,{children:"Tabs.List"}),", ",e(n.code,{children:"Tab"}),", and ",e(n.code,{children:"Tabs.Panel"})," props:"]}),`
`,e(p,{children:e(n.pre,{class:"shiki poimandres",style:{backgroundColor:"#1b1e28",color:"#a6accd"},tabindex:"0",rawCodeString:`const CustomTabs = (props: PropsOf<typeof Tabs.Root>) => (
  <Tabs.Root
    {...props}
    tabListComponent={CustomTabsList}
    tabComponent={CustomTab}
    tabPanelComponent={CustomTabsPanel}
  />
);`,children:e(n.code,{children:[e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5"},children:"const"}),e(n.span,{style:{color:"#ADD7FF"},children:" CustomTabs"}),e(n.span,{style:{color:"#91B4D5"},children:" ="}),e(n.span,{style:{color:"#A6ACCD"},children:" ("}),e(n.span,{style:{color:"#E4F0FB"},children:"props"}),e(n.span,{style:{color:"#91B4D5"},children:":"}),e(n.span,{style:{color:"#A6ACCDC0"},children:" PropsOf"}),e(n.span,{style:{color:"#A6ACCD"},children:"<"}),e(n.span,{style:{color:"#91B4D5"},children:"typeof"}),e(n.span,{style:{color:"#E4F0FB"},children:" Tabs"}),e(n.span,{style:{color:"#A6ACCD"},children:"."}),e(n.span,{style:{color:"#E4F0FB"},children:"Root"}),e(n.span,{style:{color:"#A6ACCD"},children:">) "}),e(n.span,{style:{color:"#91B4D5"},children:"=>"}),e(n.span,{style:{color:"#A6ACCD"},children:" ("})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"  <"}),e(n.span,{style:{color:"#5DE4C7"},children:"Tabs.Root"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#E4F0FB"},children:"    {"}),e(n.span,{style:{color:"#91B4D5"},children:"..."}),e(n.span,{style:{color:"#E4F0FB"},children:"props}"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    tabListComponent"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FB"},children:"{CustomTabsList}"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    tabComponent"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FB"},children:"{CustomTab}"})]}),`
`,e(n.span,{class:"line",children:[e(n.span,{style:{color:"#91B4D5",fontStyle:"italic"},children:"    tabPanelComponent"}),e(n.span,{style:{color:"#91B4D5"},children:"="}),e(n.span,{style:{color:"#E4F0FB"},children:"{CustomTabsPanel}"})]}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#E4F0FB"},children:"  />"})}),`
`,e(n.span,{class:"line",children:e(n.span,{style:{color:"#A6ACCD"},children:");"})})]})})}),`
`,e("br",{}),`
`,e(r,{status:"warning",children:e(n.p,{children:`If you don't do the above, the Tabs component cannot know if your CustomTab component is
a Tab component.`})}),`
`,e(I,{}),`
`,e(n.h2,{id:"accessibility",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#accessibility",children:e(n.span,{class:"icon icon-link"})}),"Accessibility"]}),`
`,e(n.h3,{id:"keyboard-interaction",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#keyboard-interaction",children:e(n.span,{class:"icon icon-link"})}),"Keyboard interaction"]}),`
`,e(c,{keyDescriptors:[{keyTitle:"Tab",description:"Moves focus to the selected panel."},{keyTitle:"Shift + Tab",description:"Moves focus to the selected tab."},{keyTitle:"ArrowRight",description:"Moves focus to the next tab."},{keyTitle:"ArrowLeft",description:"Moves focus to the previous tab."},{keyTitle:"ArrowDown",description:'In "vertical mode", moves focus to the next tab.'},{keyTitle:"ArrowUp",description:'In "vertical mode", moves focus to the previous tab.'},{keyTitle:"Home",description:"Moves focus to the first tab."},{keyTitle:"PageUp",description:"Moves focus to the first tab."},{keyTitle:"End",description:"Moves focus to the last tab."},{keyTitle:"PageDown",description:"Moves focus to the first tab."}]}),`
`,e(n.h2,{id:"api",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#api",children:e(n.span,{class:"icon icon-link"})}),"API"]}),`
`,e(n.h3,{id:"tabs-1",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tabs-1",children:e(n.span,{class:"icon icon-link"})}),"Tabs"]}),`
`,e(s,{propDescriptors:[{name:"behavior",type:"string",description:"Toggle between automatic or manual. The automatic behavior moves between tabs when hover. The manual behavior moves between tabs on click."},{name:"selectedIndex",type:"number",description:"A way to set the selected index programmatically"},{name:"selectedTabId",type:"number",description:"A way to set the selected tabId programmatically. The tabId is set by the `key` prop of the Tab or Tabs.Panel"},{name:"vertical",type:"boolean",description:"If set to true, the behavior of UpArrow and DownArrow will navigate between tabs vertically instead of horizontally."},{name:"onSelectedIndexChange$",type:"function",info:"(index: number) => void",description:"An event hook that gets notified whenever the selected index changes"},{name:"onSelectedTabIdChange$",type:"function",info:"(index: string) => void",description:"An event hook that gets notified whenever the selected tabId changes"},{name:"bind:selectedIndex",type:"signal",info:"Signal<number | undefined>",description:"A signal that binds the selected index. This is a more efficient version of `selectedIndex` + `onSelectedIndexChange$`"},{name:"bind:selectedTabId",type:"signal",info:"Signal<string | undefined>",description:"A signal that binds the selected tabId. This is a more efficient version of `selectedTabId` + `onSelectedTabIdChange$`"}]}),`
`,e(n.h3,{id:"tab",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tab",children:e(n.span,{class:"icon icon-link"})}),"Tab"]}),`
`,e(s,{propDescriptors:[{name:"selectedClassName",type:"string",description:"The class name to apply when the tab is selected"},{name:"selected",type:"boolean",description:"Select this tab by default"},{name:"disabled",type:"boolean",description:"Set the disabled state of a specific tab"},{name:"tabId",type:"string",description:"Set the tab id, can be used with `bind:selectedTabId` to select a tab programmatically"}]}),`
`,e(n.h3,{id:"tabspanel",children:[e(n.a,{"aria-hidden":"true",tabindex:"-1",href:"#tabspanel",children:e(n.span,{class:"icon icon-link"})}),"Tabs.Panel"]}),`
`,e(s,{propDescriptors:[{name:"selected",type:"boolean",description:"Select this tab by default"}]})]})},"_createMdxContent_0",[]));function l(o,n,s){throw new Error("/Users/jacksm5pro/dev/open-source/mm-upstreams/qwik-ui/apps/website/src/routes/docs/headless/tabs/index.mdx: Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}const V=(o={})=>{const n=h(b,{children:h(S,o,3,null)},3,"1302qvLN");return typeof MDXLayout=="function"?e(MDXLayout,{children:n}):n};export{V as default,O as frontmatter,M as head,R as headings};
