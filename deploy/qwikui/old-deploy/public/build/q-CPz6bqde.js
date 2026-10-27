import{_ as e}from"./q-BKZ00VYc.js";import{t as n,N as i}from"./q-CsvfasCP.js";const c=n(i(()=>e(()=>import("./q-zRc_64oN.js").then(o=>o.i),[]),"s_EOPmgpEYJ0E")),s=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Accordion } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  useStyles$(styles);
  const nums = [1, 2, 3];

  return (
    <Accordion.Root value="item-2">
      {nums.map((num) => (
        <Accordion.Item value={\`item-\${num}\`} class="collapsible" key={num}>
          <Accordion.Header>
            <Accordion.Trigger class="collapsible-trigger">
              <span>Trigger {num}</span>
              <LuChevronDown />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content class="collapsible-content collapsible-content-outline">
            Inside Content {num}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
});

// interal
import styles from '../snippets/accordion.css?inline';
`;export{s as I,c as a};
