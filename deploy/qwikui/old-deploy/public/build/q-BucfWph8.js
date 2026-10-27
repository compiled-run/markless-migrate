import{_ as e}from"./q-BKZ00VYc.js";import{t as a,N as t}from"./q-CsvfasCP.js";const r=a(t(()=>e(()=>import("./q-BuH4yAFF.js"),[]),"s_5ngT00HIppU")),l=`import { component$, useSignal } from '@builder.io/qwik';
import { Textarea, Label } from '~/components/ui';

export default component$(() => {
  const valueSig = useSignal('test@test.com');
  return (
    <div class="grid w-full max-w-sm items-center gap-1.5">
      <Label for="email-2">Email</Label>
      <Textarea id="email-2" placeholder="Email" bind:value={valueSig} />
      <p class="text-sm text-muted-foreground">Your email is: {valueSig.value}</p>
    </div>
  );
});
`;export{l as D,r as a};
