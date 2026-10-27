import{_ as o}from"./q-BKZ00VYc.js";import{t as r,N as b}from"./q-CsvfasCP.js";const m=r(b(()=>o(()=>import("./q-D7u_SnEr.js"),[]),"s_rW0BQtY4CjM")),s=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Combobox } from '@qwik-ui/headless';
import { LuCheck, LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);

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
    <Combobox.Root class="combobox-root" placeholder="placeholder">
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
  );
});

// internal
import styles from '../snippets/combobox.css?inline';
`;export{s as P,m as a};
