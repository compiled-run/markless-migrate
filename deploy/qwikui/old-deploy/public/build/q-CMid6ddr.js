import{_ as l}from"./q-BKZ00VYc.js";import{t as o,N as s}from"./q-CsvfasCP.js";const p=o(s(()=>l(()=>import("./q-D0WNCNAD.js").then(e=>e.p),[]),"s_klpLrq3EMJ8")),a=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Collapsible } from '@qwik-ui/headless';
import styles from '../snippets/collapsible.css?inline';

export default component$(() => {
  useStyles$(styles);
  const isOpen = useSignal<boolean>(false);

  return (
    <>
      <input
        style={{
          width: '20px',
          height: '20px',
          accentColor: 'oklch(from var(--primary) l c h)',
        }}
        type="checkbox"
        bind:checked={isOpen}
      />

      <p>
        is open: <strong>{isOpen.value ? 'true' : 'false'}</strong>
      </p>

      <Collapsible.Root class="collapsible" bind:open={isOpen}>
        <Collapsible.Trigger class="collapsible-trigger">Trigger</Collapsible.Trigger>
        <Collapsible.Content class="collapsible-content">
          <p class="collapsible-content-outline">Content</p>
        </Collapsible.Content>
      </Collapsible.Root>
    </>
  );
});
`;export{a as P,p as a};
