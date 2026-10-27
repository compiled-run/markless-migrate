import{_ as s}from"./q-BKZ00VYc.js";import{t as o,N as r}from"./q-CsvfasCP.js";const i=o(r(()=>s(()=>import("./q-5_Ix2-tZ.js"),[]),"s_2DWaZA71HRs")),a=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Progress } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const progressSig = useSignal(30);

  return (
    <>
      <Progress.Root bind:value={progressSig} class="progress">
        <Progress.Indicator class="progress-indicator" />
      </Progress.Root>
      <button onClick$={() => (progressSig.value = 70)}>Change progress</button>
    </>
  );
});

// internal
import styles from '../snippets/progress.css?inline';
`;export{a as R,i as a};
