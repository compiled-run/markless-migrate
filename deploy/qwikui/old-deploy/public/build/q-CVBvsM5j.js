import{_ as o}from"./q-BKZ00VYc.js";import{t as r,N as e}from"./q-CsvfasCP.js";const a=r(e(()=>o(()=>import("./q-B46_dzA_.js"),[]),"s_Fsx9CPEXyXc")),p=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Popover } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(\`
  .popover-transition {
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity 0.3s ease-out,
      transform 0.3s ease-out,
      display 0.3s,
      overlay 0.3s;
    transition-behavior: allow-discrete;
  }

  .popover-transition:popover-open {
    opacity: 1;
    transform: scale(1);
    transition:
      opacity 0.3s ease-out,
      transform 0.3s ease-out,
      display 0.3s,
      overlay 0.3s;
  }

  @starting-style {
    .popover-transition:popover-open {
      opacity: 0;
      transform: scale(0.5);
    }
  }\`);

  return (
    <Popover.Root>
      <Popover.Trigger class="popover-trigger">Popover Trigger</Popover.Trigger>
      <Popover.Panel class="popover-panel popover-transition">
        I'm a popover!
      </Popover.Panel>
    </Popover.Root>
  );
});
`;export{p as T,a};
