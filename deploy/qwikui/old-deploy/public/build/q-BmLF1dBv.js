import{_ as t}from"./q-BKZ00VYc.js";import{t as l,N as s}from"./q-CsvfasCP.js";const a=l(s(()=>t(()=>import("./q-C9X5mmBX.js").then(e=>e.m),[]),"s_09SiMWojiPE")),o=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
import { LuCheck, LuX } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];
  const display = useSignal<string[]>([]);
  const selected = useSignal<string[]>([]);

  return (
    <Select.Root
      multiple
      bind:displayValue={display}
      bind:value={selected}
      class="select"
    >
      <Select.Label>Logged in users</Select.Label>
      <Select.Trigger class="select-trigger">
        <Select.DisplayValue>
          {display.value.map((item) => (
            <span class="select-pill" key={item}>
              {item}
              <span
                onClick$={() => {
                  selected.value = selected.value?.filter(
                    (selectedItem) => selectedItem !== item,
                  );
                }}
              >
                <LuX aria-hidden="true" />
              </span>
            </span>
          ))}
        </Select.DisplayValue>
      </Select.Trigger>
      <Select.Popover class="select-popover">
        {users.map((user) => (
          <Select.Item class="select-item" key={user}>
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
`;export{o as M,a};
