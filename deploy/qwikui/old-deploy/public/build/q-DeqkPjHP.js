import{_ as o}from"./q-BKZ00VYc.js";import{t as e,N as i}from"./q-CsvfasCP.js";const c=e(i(()=>o(()=>import("./q-DnBl-idc.js"),[]),"s_VgkVLa9Jxq4")),n=`import { component$ } from '@builder.io/qwik';
import { Accordion } from '@qwik-ui/headless';
import { LuChevronDown } from '@qwikest/icons/lucide';

export default component$(() => {
  const items = [1, 2, 3];

  return (
    <Accordion.Root multiple>
      {items.map((item) => (
        <Accordion.Item class="collapsible" key={item}>
          <Accordion.Header>
            <Accordion.Trigger class="collapsible-trigger">
              <span>Trigger {item}</span>
              <LuChevronDown />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content class="collapsible-content-outline collapsible-content">
            Inside Content {item}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
});
`;export{n as M,c as a};
