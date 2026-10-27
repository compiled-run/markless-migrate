import{_ as s}from"./q-BKZ00VYc.js";import{t as e,N as r}from"./q-CsvfasCP.js";const i=e(r(()=>s(()=>import("./q-CpbrF9Ki.js"),[]),"s_Co8fFunUQAw")),n=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Progress } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const progressSig = useSignal(null);

  return (
    <Progress.Root value={progressSig.value} class="progress">
      <Progress.Indicator class="progress-indicator indeterminate" />
    </Progress.Root>
  );
});

// internal
import styles from '../snippets/progress.css?inline';
`;export{n as I,i as a};
