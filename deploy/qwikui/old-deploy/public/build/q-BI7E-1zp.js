import{_ as e}from"./q-BKZ00VYc.js";import{t,N as s}from"./q-CsvfasCP.js";const r=t(s(()=>e(()=>import("./q-BYp1FK4N.js"),[]),"s_kfyUjnlRvwA")),i=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
import styles from '../snippets/select.css?inline';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];
  const isOpen = useSignal(false);

  return (
    <>
      <button onClick$={() => (isOpen.value = true)}>Toggle open state</button>
      <Select.Root bind:open={isOpen} class="select">
        <Select.Label>Logged in users</Select.Label>
        <Select.Trigger class="select-trigger">
          <Select.DisplayValue placeholder="Select an option" />
        </Select.Trigger>
        <Select.Popover class="select-popover">
          {users.map((user) => (
            <Select.Item key={user}>
              <Select.ItemLabel>{user}</Select.ItemLabel>
            </Select.Item>
          ))}
        </Select.Popover>
      </Select.Root>
    </>
  );
});
`;export{i as B,r as a};
