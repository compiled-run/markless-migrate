import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as t}from"./q-CsvfasCP.js";const s=r(t(()=>e(()=>import("./q-BmE-lm7Z.js").then(o=>o.t),[]),"s_4gq3TyK0TOA")),g=`import { component$, useSignal } from '@builder.io/qwik';
import { Popover } from '@qwik-ui/headless';
export default component$(() => {
  const toggleStatus = useSignal<'open' | 'closed'>('closed');

  return (
    <Popover.Root>
      <p>Panel is {toggleStatus.value}!</p>
      <Popover.Trigger class="popover-trigger">Popover Trigger</Popover.Trigger>
      <Popover.Panel
        class="popover-panel"
        onToggle$={(e) => {
          toggleStatus.value = e.newState;
        }}
      >
        My Hero!
      </Popover.Panel>
    </Popover.Root>
  );
});
`;export{g as T,s as a};
