import{_ as t}from"./q-BKZ00VYc.js";import{t as e,N as i}from"./q-CsvfasCP.js";const r=e(i(()=>t(()=>import("./q-0xq0XHHk.js").then(o=>o.o),[]),"s_LqsYg4jpj0E")),a=`import { component$, useSignal } from '@builder.io/qwik';
import { Tooltip } from '@qwik-ui/headless';

export default component$(() => {
  const tooltipState = useSignal<'open' | 'closed'>('closed');

  return (
    <>
      <Tooltip.Root gutter={4} onOpenChange$={(e) => (tooltipState.value = e)} flip>
        <Tooltip.Trigger>Hover or Focus me</Tooltip.Trigger>
        <Tooltip.Panel aria-label="Tooltip content">
          <Tooltip.Arrow width={10} height={5} />
          Tooltip content here
        </Tooltip.Panel>
      </Tooltip.Root>
      The tooltip is {tooltipState.value}
    </>
  );
});
`;export{a as O,r as a};
