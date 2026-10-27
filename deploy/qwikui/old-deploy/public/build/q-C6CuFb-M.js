import{_ as o}from"./q-BKZ00VYc.js";import{t as a,N as l}from"./q-CsvfasCP.js";const d=a(l(()=>o(()=>import("./q-DPg4XeWx.js"),[]),"s_Bgk6Y0oodQo")),s=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Modal } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  return (
    <Modal.Root>
      <Modal.Trigger class="modal-trigger">Open Modal</Modal.Trigger>
      <Modal.Panel class="modal-panel">
        <Modal.Title>Open stacked Modal</Modal.Title>
        <Modal.Description>
          You can open a Modal on top of another Modal.
        </Modal.Description>
        <Modal.Root>
          <Modal.Trigger class="modal-trigger">Open Modal</Modal.Trigger>
          <Modal.Panel class="modal-panel" style={{ width: '300px' }}>
            <Modal.Title>I am a stacked Modal</Modal.Title>
            <Modal.Description>
              You cannot interact with the other modal until you close me.
            </Modal.Description>
            <Modal.Close class="modal-close">Close Modal</Modal.Close>
          </Modal.Panel>
        </Modal.Root>
      </Modal.Panel>
    </Modal.Root>
  );
});

// internal
import styles from '../snippets/modal.css?inline';
`;export{s as S,d as a};
