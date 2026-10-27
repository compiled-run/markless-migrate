import{_ as t}from"./q-BKZ00VYc.js";import{t as s,N as l}from"./q-CsvfasCP.js";const r=s(l(()=>t(()=>import("./q-DejFCAtc.js").then(e=>e.i),[]),"s_lCu82jn6Mew")),i=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
import { LuCheck } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];

  return (
    <Select.Root class="select">
      <Select.Label>Logged in users</Select.Label>
      <Select.Trigger class="select-trigger">
        <Select.DisplayValue placeholder="Select an option" />
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
`;export{i as I,r as a};
