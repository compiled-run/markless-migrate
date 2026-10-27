import{_ as b}from"./q-BKZ00VYc.js";import{t as e,N as r}from"./q-CsvfasCP.js";const s=e(r(()=>b(()=>import("./q-Ccw_43LV.js").then(o=>o.c),[]),"s_ZOJ3Jt0O52c")),c=`import { component$, useStyles$, useSignal } from '@builder.io/qwik';
import { Combobox } from '@qwik-ui/headless';
import { LuCheck, LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const renderCombobox = useSignal(false);

  const fruits = [
    'Apple',
    'Apricot',
    'Bilberry',
    'Blackberry',
    'Blackcurrant',
    'Currant',
    'Cherry',
    'Coconut',
  ];

  return (
    <>
      <button onClick$={() => (renderCombobox.value = true)}>CSR mode</button>
      {renderCombobox.value && (
        <Combobox.Root class="combobox-root">
          <Combobox.Label class="combobox-label">Personal Trainers</Combobox.Label>

          <Combobox.Control class="combobox-control">
            <Combobox.Input class="combobox-input" />
            <Combobox.Trigger class="combobox-trigger">
              <LuChevronDown class="combobox-icon" />
            </Combobox.Trigger>
          </Combobox.Control>

          <Combobox.Popover class="combobox-popover" gutter={8}>
            {fruits.map((fruit) => (
              <Combobox.Item key={fruit} class="combobox-item">
                <Combobox.ItemLabel>{fruit}</Combobox.ItemLabel>
                <Combobox.ItemIndicator>
                  <LuCheck />
                </Combobox.ItemIndicator>
              </Combobox.Item>
            ))}
          </Combobox.Popover>
        </Combobox.Root>
      )}
    </>
  );
});

// internal
import styles from '../snippets/combobox.css?inline';
`;export{c as C,s as a};
