import{_ as e}from"./q-BKZ00VYc.js";import{t as o,N as s}from"./q-CsvfasCP.js";const n=o(s(()=>e(()=>import("./q-CMZbcA04.js").then(l=>l.c),[]),"s_szIj9bV5kbE")),r=`import { component$, useStyles$, useSignal } from '@builder.io/qwik';
import { Collapsible } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const renderCollapsible = useSignal(false);

  return (
    <>
      <button onClick$={() => (renderCollapsible.value = true)}>
        Render Collapsible
      </button>
      {renderCollapsible.value && (
        <Collapsible.Root class="collapsible">
          <Collapsible.Trigger class="collapsible-trigger">
            <span>Trigger</span>
            <LuChevronDown />
          </Collapsible.Trigger>
          <Collapsible.Content class="collapsible-content collapsible-content-outline">
            Content
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    </>
  );
});

// internal
import styles from '../snippets/collapsible.css?inline';
`;export{r as C,n as a};
