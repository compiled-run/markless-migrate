import{_ as t}from"./q-BKZ00VYc.js";import{t as s,N as l}from"./q-CsvfasCP.js";const r=s(l(()=>t(()=>import("./q-2XSuH5Hx.js").then(e=>e.d),[]),"s_jrRbp1lVw94")),i=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];

  return (
    <Select.Root class="select">
      <Select.Label>Logged in users</Select.Label>
      <Select.Trigger class="select-trigger">
        <Select.DisplayValue placeholder="Select an option" />
      </Select.Trigger>
      <Select.Description>Select a user to see their profile</Select.Description>
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
import { LuCheck } from '@qwikest/icons/lucide';
`;export{i as D,r as a};
