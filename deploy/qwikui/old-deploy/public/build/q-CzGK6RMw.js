import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as a}from"./q-CsvfasCP.js";const n=r(a(()=>e(()=>import("./q-je54i2Q-.js").then(o=>o.p),[]),"s_emFmLD2UtKA")),i=`import { component$, useSignal } from '@builder.io/qwik';
import { Popover, usePopover } from '@qwik-ui/headless';
export default component$(() => {
  const popoverId = 'programmatic-id';
  const anchorRef = useSignal<HTMLElement | undefined>();
  const { togglePopover } = usePopover(popoverId);

  return (
    <Popover.Root id={popoverId} bind:anchor={anchorRef} manual>
      {/* can be anywhere as long as ref is set */}
      <button
        ref={anchorRef}
        class="popover-invoker"
        preventdefault:click
        onKeyDown$={async (e) => {
          if (e.key === 'o') {
            await togglePopover();
          }
        }}
        onClick$={async () => {
          await togglePopover();
        }}
      >
        Click me or focus me and press the 'o' key!
      </button>
      <Popover.Panel class="popover-panel popover-programmatic">
        I'm a programmatically opened popover!
      </Popover.Panel>
    </Popover.Root>
  );
});
`;export{i as P,n as a};
