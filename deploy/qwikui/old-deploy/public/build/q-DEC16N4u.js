import{_ as t}from"./q-BKZ00VYc.js";import{t as s,N as l}from"./q-CsvfasCP.js";const c=s(l(()=>t(()=>import("./q-Dae6UNxP.js").then(e=>e.c),[]),"s_TfRvReV6i6k")),i=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Select } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);
  const users = ['Tim', 'Ryan', 'Jim', 'Jessie', 'Abby'];
  const renderSelect = useSignal(false);

  return (
    <>
      <button onClick$={() => (renderSelect.value = true)}>CSR mode</button>
      {renderSelect.value && (
        <Select.Root class="select">
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
      )}
    </>
  );
});

// internal
import styles from '../snippets/select.css?inline';
`;export{i as C,c as a};
