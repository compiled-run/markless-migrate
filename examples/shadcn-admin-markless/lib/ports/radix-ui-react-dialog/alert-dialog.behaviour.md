# @radix-ui/react-alert-dialog: the certified Markless port

Copied by markless-migrate parity from the port markless-migrate ships. Certified against @radix-ui/react-alert-dialog 1.1.15 by test/e2e/radix-dialog-port.test.ts: generated action sequences on the real library and on this port show the same markup, attributes, focus and animation frames. Do not edit these files; every site shares them.

Import from `lib/ports/radix-ui-react-dialog/alert-dialog.tsrx`. Each part renders the library's own markup (`data-state`, `role`, ids and aria references), so the old classes and selectors work unchanged. Element props (class, id, data-*, aria-*, event handlers) pass through to the element a part renders.

| Library export | Component | Props it covers | Not covered |
| --- | --- | --- | --- |
| Root | AlertDialogRoot | open, defaultOpen, onOpenChange, children | nothing |
| Trigger | AlertDialogTrigger | children, onClick, asChild (asChild: render the part with the child button's own classes and attributes; the part is that <button>) | nothing |
| Portal | AlertDialogPortal | children | container: each part moves to the end of its Markless container as it opens; forceMount: the parts are always rendered, hidden while closed |
| Overlay | AlertDialogOverlay | children | forceMount: the part is always rendered, hidden while closed; asChild: the part renders its own <div> |
| Content | AlertDialogContent | children | forceMount: the part is always rendered, hidden while closed; asChild: the part renders its own <div>; onOpenAutoFocus: the opening focus is always Radix's default; onCloseAutoFocus: the closing focus always returns to the trigger; onEscapeKeyDown: Escape always closes the dialog; onPointerDownOutside: a press outside always closes the dialog (an alert dialog never); onInteractOutside: a press outside always closes the dialog (an alert dialog never) |
| Title | AlertDialogTitle | children | asChild: the part renders its own <h2> |
| Description | AlertDialogDescription | children, asChild (asChild: the child is a <div>; write its content inside the part and the part renders that <div>) | nothing |
| Cancel | AlertDialogCancel | children, onClick, asChild (takes the opening focus; asChild as for Trigger) | nothing |
| Action | AlertDialogAction | children, onClick, asChild (asChild: render the part with the child button's own classes and attributes; the part is that <button>) | nothing |

- A control the old app writes with React's autoFocus: write the autofocus attribute on it. The port focuses it as the dialog opens, as React does, and takes the attribute off.
- The parts stay in the page, hidden while closed, and keep their elements between openings, where React mounts new ones. A field the old app leaves uncontrolled would keep what was typed: bind it to state and reset that state when the dialog opens.
- Not covered: a second dialog opened while another is open (stacked dialogs), and the non-modal dialog.
- A menu, select or popover port marked with data-radix-popper-content-wrapper is a layer above an open dialog, as Radix's own are: shown, it moves after the dialog and stays exposed, and presses, focus and Escape inside it are its own.
- A live region the page keeps hidden is marked hidden with the rest of the page; aria-hidden keeps every live region, but a hidden one announces nothing.
- A dialog the page opens through its own state rather than a trigger is wired when the page goes idle; opened before that, it gains its focus handling once the port has loaded.

## What the app uses

- Cancel -> AlertDialogCancel
- Content -> AlertDialogContent
- Description -> AlertDialogDescription
- Root -> AlertDialogRoot
- Title -> AlertDialogTitle
- shadcn/ui AlertDialog -> AlertDialogRoot
- shadcn/ui AlertDialogCancel -> AlertDialogCancel
- shadcn/ui AlertDialogContent -> AlertDialogContent
- shadcn/ui AlertDialogDescription -> AlertDialogDescription
- shadcn/ui AlertDialogTitle -> AlertDialogTitle
