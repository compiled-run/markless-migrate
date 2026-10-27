import{_ as e}from"./q-BKZ00VYc.js";import{t,N as s}from"./q-CsvfasCP.js";const o=t(s(()=>e(()=>import("./q-CVl7YCNm.js"),[]),"s_ZOcaUjAym7Y")),c=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
import { LuCheck } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];
  const display = useSignal<string[]>([]);

  return (
    <Select.Root bind:displayValue={display} multiple class="select">
      <Select.Trigger class="select-trigger">
        <Select.DisplayValue>{display.value.join(', ')}</Select.DisplayValue>
      </Select.Trigger>
      <Select.Popover class="select-popover">
        {users.map((user, index) => (
          <Select.Item value={index.toString()} class="select-item" key={user}>
            <Select.ItemLabel>{user}</Select.ItemLabel>
            <Select.ItemIndicator>
              <LuCheck />
            </Select.ItemIndicator>
          </Select.Item>
        ))}
      </Select.Popover>
    </Select.Root>
  );
});

// internal
import styles from '../snippets/select.css?inline';
`;export{c as M,o as a};
