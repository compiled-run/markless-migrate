import{_ as e}from"./q-BKZ00VYc.js";import{t as s,N as o}from"./q-CsvfasCP.js";const a=s(o(()=>e(()=>import("./q-7xoiWV9I.js"),[]),"s_FLd2Q7xPL3E")),n=`import { component$, useSignal } from '@builder.io/qwik';
import { Toggle } from '~/components/ui';

export default component$(() => {
  const text = useSignal('Unpress me');
  return (
    <div class="flex flex-col">
      <Toggle
        pressed
        onPressedChange$={(p) =>
          p ? (text.value = 'Unpress me') : (text.value = 'Press me')
        }
      >
        Hello
      </Toggle>
      <span>{text.value}</span>
    </div>
  );
});
`;export{n as P,a};
