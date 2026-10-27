import{_ as o}from"./q-BKZ00VYc.js";import{t as e,N as i}from"./q-CsvfasCP.js";const r=e(i(()=>o(()=>import("./q-49S0-flx.js"),[]),"s_G0sPb37Z7jY")),s=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Accordion } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const items = [1, 2, 3, 4];

  return (
    <Accordion.Root>
      {items.map((item, index) => (
        <Accordion.Item
          disabled={index === 1 || index === 3 ? true : false}
          class="collapsible"
          key={item}
        >
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
`;export{s as D,r as a};
