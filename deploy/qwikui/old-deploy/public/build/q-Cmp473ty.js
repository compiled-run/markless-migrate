import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as o}from"./q-CsvfasCP.js";const n=r(o(()=>e(()=>import("./q-DtIz_bYp.js").then(s=>s.c),[]),"s_Hq1F0vtpSsk")),a=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Progress } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const progress = 30;
  const isRendered = useSignal(false);

  return (
    <>
      <button onClick$={() => (isRendered.value = true)}>Render the progress bar</button>
      {isRendered.value && (
        <Progress.Root value={progress} class="progress">
          <Progress.Indicator class="progress-indicator" />
        </Progress.Root>
      )}
    </>
  );
});

// internal
import styles from '../snippets/progress.css?inline';
`;export{a as C,n as a};
