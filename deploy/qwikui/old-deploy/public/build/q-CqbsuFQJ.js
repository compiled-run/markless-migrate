import{_ as e}from"./q-BKZ00VYc.js";import{t,N as l}from"./q-CsvfasCP.js";const a=t(l(()=>e(()=>import("./q-i6rGddqU.js"),[]),"s_MKkQ0tVZy0k")),r=`import { $, component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
export default component$(() => {
  useStyles$(styles);
  const users = [
    { id: '0', name: 'Tim' },
    { id: '1', name: 'Ryan' }, // 👈 start with Ryan
    { id: '2', name: 'Jim' },
    { id: '3', name: 'Jessie' },
    { id: '4', name: 'Abby' },
  ];
  const selectedId = useSignal<string>('1');

  return (
    <>
      <Select.Root bind:value={selectedId} class="select">
        <Select.Label>Logged in users</Select.Label>
        <Select.Trigger class="select-trigger">
          <Select.DisplayValue placeholder="Select an option" />
        </Select.Trigger>
        <Select.Popover class="select-popover">
          {users.map((user) => (
            <Select.Item value={user.id} key={user.id}>
              <Select.ItemLabel>{user.name}</Select.ItemLabel>
            </Select.Item>
          ))}
        </Select.Popover>
      </Select.Root>
      <button onClick$={$(() => (selectedId.value = '4'))}>Change to Abby</button>
    </>
  );
});

// internal
import styles from '../snippets/select.css?inline';
`;export{r as C,a};
