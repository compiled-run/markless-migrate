import{_ as e}from"./q-BKZ00VYc.js";import{t as b,N as t}from"./q-CsvfasCP.js";const m=b(t(()=>e(()=>import("./q-IBhcGjXF.js").then(o=>o.r),[]),"s_EBZvCo5WmeQ")),i=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Combobox } from '@qwik-ui/headless';
import { LuCheck, LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);

  const isOpen = useSignal(false);

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
      <Combobox.Root class="combobox-root" bind:open={isOpen}>
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
      <button onClick$={() => (isOpen.value = !isOpen.value)}>Toggle open state</button>
    </>
  );
});

// internal
import styles from '../snippets/combobox.css?inline';
`;export{i as R,m as a};
