import{_ as b}from"./q-BKZ00VYc.js";import{t as e,N as m}from"./q-CsvfasCP.js";const s=e(m(()=>b(()=>import("./q-DB72UNKj.js").then(o=>o.s),[]),"s_CNiLVa07kvI")),i=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Combobox } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const items = Array.from({ length: 100 }, (_, i) => (i + 1).toString());

  return (
    <Combobox.Root class="combobox-root">
      <Combobox.Label class="combobox-label">User count</Combobox.Label>
      <Combobox.Control class="combobox-control">
        <Combobox.Input class="combobox-input" />
        <Combobox.Trigger class="combobox-trigger">
          <LuChevronDown class="combobox-icon" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Popover class="combobox-popover combobox-max-height" gutter={8}>
        {items.map((item) => (
          <Combobox.Item key={item}>
            <Combobox.ItemLabel>{item}</Combobox.ItemLabel>
          </Combobox.Item>
        ))}
      </Combobox.Popover>
    </Combobox.Root>
  );
});

// internal
import styles from '../snippets/combobox.css?inline';
`;export{i as S,s as a};
