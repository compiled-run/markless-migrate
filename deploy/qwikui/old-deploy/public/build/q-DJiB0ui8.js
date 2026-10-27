import{_ as e}from"./q-BKZ00VYc.js";import{t as l,N as a}from"./q-CsvfasCP.js";const i=l(a(()=>e(()=>import("./q-DcolXep-.js").then(o=>o.p),[]),"s_gAQjhQ6hKYw")),n=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Modal, Label } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);
  const isOpen = useSignal(false);

  return (
    <>
      <button onClick$={() => (isOpen.value = true)} class="modal-trigger">
        Programmatically open modal
      </button>
      <Modal.Root bind:show={isOpen}>
        <Modal.Panel class="modal-panel">
          <Modal.Title>Edit Profile</Modal.Title>
          <Modal.Description>
            You can update your profile here. Hit the save button when finished.
          </Modal.Description>
          <Label>
            Name
            <input type="text" placeholder="John Doe" />
          </Label>
          <Label>
            Email
            <input type="text" placeholder="johndoe@gmail.com" />
          </Label>
          <footer>
            <Modal.Close class="modal-close">Cancel</Modal.Close>
            <Modal.Close class="modal-close">Save Changes</Modal.Close>
          </footer>
        </Modal.Panel>
      </Modal.Root>
    </>
  );
});

// internal
import styles from '../snippets/modal.css?inline';
`;export{n as P,i as a};
