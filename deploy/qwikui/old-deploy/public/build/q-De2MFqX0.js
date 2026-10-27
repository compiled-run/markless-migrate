import{_ as t}from"./q-BKZ00VYc.js";import{t as s,N as l}from"./q-CsvfasCP.js";const r=s(l(()=>t(()=>import("./q-B-6fcXyS.js").then(e=>e.o),[]),"s_x8MADZ16j1k")),c=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';
import styles from '../snippets/select.css?inline';

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
    <Select.Root class="select">
      <Select.Label>Logged in users</Select.Label>
      <Select.Trigger class="select-trigger">
        <Select.DisplayValue placeholder="Select an option" />
      </Select.Trigger>
      <Select.Popover class="select-popover">
        {users.map((user) => (
          <Select.Item key={user.name}>
            <Select.ItemLabel>{\`\${user.status} \${user.name}\`}</Select.ItemLabel>
          </Select.Item>
        ))}
      </Select.Popover>
    </Select.Root>
  );
});
`;export{c as O,r as a};
