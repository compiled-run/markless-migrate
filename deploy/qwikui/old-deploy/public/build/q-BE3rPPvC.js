import{_ as o}from"./q-BKZ00VYc.js";import{t as s,N as e}from"./q-CsvfasCP.js";const i=s(e(()=>o(()=>import("./q-CeaoZcFi.js"),[]),"s_7ns4pg0OPio")),t=`import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { Progress } from '~/components/ui';

export default component$(() => {
  const progress = useSignal(20);

  useVisibleTask$(() => {
    setTimeout(() => {
      progress.value = 50;
    }, 500);
  });

  return <Progress bind:value={progress} />;
});
`;export{t as H,i as a};
