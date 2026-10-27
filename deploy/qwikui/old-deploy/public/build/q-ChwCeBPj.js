import{_ as e}from"./q-BKZ00VYc.js";import{t as o,N as t}from"./q-CsvfasCP.js";const s=o(t(()=>e(()=>import("./q-hh8vac3f.js"),[]),"s_0bHEgJr1u5U")),c=`import { component$, useSignal } from '@builder.io/qwik';
import { Checkbox } from '@qwik-ui/headless';
export default component$(() => {
  const isCheckedSig = useSignal(false);

  return (
    <Checkbox.Root
      bind:checked={isCheckedSig}
      id="test"
      class="flex items-center gap-3 border-2 border-black p-2"
    >
      <div class="flex h-[25px] w-[25px] items-center justify-center bg-slate-600">
        <Checkbox.Indicator>✅</Checkbox.Indicator>
      </div>
      <p> I have read the README</p>
    </Checkbox.Root>
  );
});
`;export{c as H,s as a};
