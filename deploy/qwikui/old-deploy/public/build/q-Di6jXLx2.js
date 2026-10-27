import{_ as e}from"./q-BKZ00VYc.js";import{t as o,N as l}from"./q-CsvfasCP.js";const t=o(l(()=>e(()=>import("./q-naj6Tarv.js"),[]),"s_w4axoAPNrxs")),a=`import { component$, useStyles$, useSignal, $ } from '@builder.io/qwik';
import { Collapsible } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const count = useSignal<number>(0);
  const isOpen = useSignal<boolean>(false);

  const handleChange$ = $((open: boolean) => {
    isOpen.value = open;
    count.value++;
  });

  return (
    <>
      <p>
        count: <strong> {count.value}</strong>
      </p>

      <Collapsible.Root class="collapsible" onChange$={handleChange$}>
        <Collapsible.Trigger class="collapsible-trigger">
          <span>Trigger</span>
          <LuChevronDown />
        </Collapsible.Trigger>
        <Collapsible.Content class="collapsible-content collapsible-content-outline">
          Content
        </Collapsible.Content>
      </Collapsible.Root>
    </>
  );
});

// internal
import styles from '../snippets/collapsible.css?inline';
`;export{a as O,t as a};
