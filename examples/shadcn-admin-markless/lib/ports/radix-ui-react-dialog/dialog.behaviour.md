# @radix-ui/react-dialog: the certified Markless port

Copied by markless-migrate parity from the port markless-migrate ships. Certified against @radix-ui/react-dialog 1.1.15 by test/e2e/radix-dialog-port.test.ts: generated action sequences on the real library and on this port show the same markup, attributes, focus and animation frames. Do not edit these files; every site shares them.

Import from `lib/ports/radix-ui-react-dialog/dialog.tsrx`. Each part renders the library's own markup (`data-state`, `role`, ids and aria references), so the old classes and selectors work unchanged. Element props (class, id, data-*, aria-*, event handlers) pass through to the element a part renders.

| Library export | Component | Props it covers | Not covered |
| --- | --- | --- | --- |
| Root | DialogRoot | open, defaultOpen, onOpenChange, children | modal: only the modal dialog (the default) is ported |
| Trigger | DialogTrigger | children, onClick, asChild (asChild: render the part with the child button's own classes and attributes; the part is that <button>) | nothing |
| Portal | DialogPortal | children | container: each part moves to the end of its Markless container as it opens; forceMount: the parts are always rendered, hidden while closed |
| Overlay | DialogOverlay | children | forceMount: the part is always rendered, hidden while closed; asChild: the part renders its own <div> |
| Content | DialogContent | children | forceMount: the part is always rendered, hidden while closed; asChild: the part renders its own <div>; onOpenAutoFocus: the opening focus is always Radix's default; onCloseAutoFocus: the closing focus always returns to the trigger; onEscapeKeyDown: Escape always closes the dialog; onPointerDownOutside: a press outside always closes the dialog (an alert dialog never); onInteractOutside: a press outside always closes the dialog (an alert dialog never) |
| Title | DialogTitle | children | asChild: the part renders its own <h2> |
| Description | DialogDescription | children, asChild (asChild: the child is a <div>; write its content inside the part and the part renders that <div>) | nothing |
| Close | DialogClose | children, onClick, asChild (asChild: render the part with the child button's own classes and attributes; the part is that <button>) | nothing |

- A control the old app writes with React's autoFocus: write the autofocus attribute on it. The port focuses it as the dialog opens, as React does, and takes the attribute off.
- The parts stay in the page, hidden while closed, and keep their elements between openings, where React mounts new ones. A field the old app leaves uncontrolled would keep what was typed: bind it to state and reset that state when the dialog opens.
- Not covered: a second dialog opened while another is open (stacked dialogs), and the non-modal dialog.
- A menu, select or popover port marked with data-radix-popper-content-wrapper is a layer above an open dialog, as Radix's own are: shown, it moves after the dialog and stays exposed, and presses, focus and Escape inside it are its own.
- A live region the page keeps hidden is marked hidden with the rest of the page; aria-hidden keeps every live region, but a hidden one announces nothing.
- A dialog the page opens through its own state rather than a trigger is wired when the page goes idle; opened before that, it gains its focus handling once the port has loaded.

## What the app uses

- Close -> DialogClose
- Content -> DialogContent
- Description -> DialogDescription
- Root -> DialogRoot
- Title -> DialogTitle
- Overlay -> DialogOverlay
- Portal -> DialogPortal
- Trigger -> DialogTrigger
- shadcn/ui Dialog -> DialogRoot
- shadcn/ui DialogContent -> DialogContent
- shadcn/ui DialogTitle -> DialogTitle
- shadcn/ui DialogDescription -> DialogDescription
- shadcn/ui Sheet -> DialogRoot
- shadcn/ui SheetContent -> DialogContent
- shadcn/ui SheetDescription -> DialogDescription
- shadcn/ui SheetTitle -> DialogTitle
- shadcn/ui DialogClose -> DialogClose
- shadcn/ui CommandDialog -> DialogRoot
  - modal at src/components/command-menu.tsx:32: not covered by the port; ask, do not work around it
- shadcn/ui SheetClose -> DialogClose
- shadcn/ui SheetTrigger -> DialogTrigger
