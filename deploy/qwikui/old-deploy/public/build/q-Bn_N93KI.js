import{_ as e}from"./q-BKZ00VYc.js";import{t as i,N as t}from"./q-CsvfasCP.js";const s=i(t(()=>e(()=>import("./q-gSdY0dp4.js").then(o=>o.c),[]),"s_WveihzCPYfc")),n=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Accordion } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const items = [1, 2, 3];

  return (
    <Accordion.Root collapsible={false}>
      {items.map((item) => (
        <Accordion.Item class="collapsible" key={item}>
          <Accordion.Header>
            <Accordion.Trigger class="collapsible-trigger">
              <span>Trigger {item}</span>
              <LuChevronDown />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content class="collapsible-content collapsible-content-outline">
            Inside Content {item}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
});

// interal
import styles from '../snippets/accordion.css?inline';
`;export{n as C,s as a};
