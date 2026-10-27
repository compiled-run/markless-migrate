import{_ as o}from"./q-BKZ00VYc.js";import{t as s,N as e}from"./q-CsvfasCP.js";const m=s(e(()=>o(()=>import("./q-CJh8MMkN.js"),[]),"s_LAccopJ0FC4")),r=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Combobox } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);

  const users = [
    { name: 'Tim', status: '🟢' },
    { name: 'Ryan', status: '🔴' },
    { name: 'Jim', status: '🟡' },
    { name: 'Jessie', status: '🟢' },
    { name: 'Abby', status: '🟡' },
  ];

  return (
    <Combobox.Root class="combobox-root">
      <Combobox.Label class="combobox-label">Logged in users</Combobox.Label>
      <Combobox.Control class="combobox-control">
        <Combobox.Input class="combobox-input" />
        <Combobox.Trigger class="combobox-trigger">
          <LuChevronDown class="combobox-icon" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Popover class="combobox-popover" gutter={8}>
        {users.map((user) => (
          <Combobox.Item key={user.name} class="combobox-item">
            <Combobox.ItemLabel>{user.name}</Combobox.ItemLabel>
            <Combobox.ItemIndicator>{user.status}</Combobox.ItemIndicator>
          </Combobox.Item>
        ))}
      </Combobox.Popover>
    </Combobox.Root>
  );
});

// internal
import styles from '../snippets/combobox.css?inline';
`;export{r as O,m as a};
