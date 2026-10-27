import{_ as s}from"./q-BKZ00VYc.js";import{t,N as o}from"./q-CsvfasCP.js";const l=t(o(()=>s(()=>import("./q-BD6PaSrT.js").then(e=>e.p),[]),"s_A7z1k05YOnU")),a=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Toggle } from '@qwik-ui/headless';
import styles from '../snippets/toggle.css?inline';

export default component$(() => {
  useStyles$(styles);
  const text = useSignal('Unpress me');
  return (
    <div class="toggle-container container-center">
      <Toggle
        pressed
        onPressedChange$={(p) =>
          p ? (text.value = 'Unpress me') : (text.value = 'Press me')
        }
        class="toggle"
      >
        Hello
      </Toggle>
      <span>{text.value}</span>
    </div>
  );
});
`;export{a as P,l as a};
