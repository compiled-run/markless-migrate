import{_ as e}from"./q-BKZ00VYc.js";import{t as o,N as a}from"./q-CsvfasCP.js";const t=o(a(()=>e(()=>import("./q-CQUe5K33.js"),[]),"s_MoDkE06UR3I")),r=`import { component$ } from '@builder.io/qwik';
import { Input, Label, Popover, buttonVariants } from '~/components/ui';

export default component$(() => {
  return (
    <Popover.Root flip={false} gutter={8}>
      <Popover.Trigger class={buttonVariants({ look: 'outline' })}>
        Open popover.
      </Popover.Trigger>
      <Popover.Panel>
        <div class="grid gap-4">
          <div class="space-y-2">
            <h4 class="leading-none font-medium">Dimensions</h4>
            <p class="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
          </div>
          <div class="grid gap-2">
            <div class="grid grid-cols-5 items-center gap-4">
              <Label class="col-span-2" for="width">
                Width
              </Label>
              <Input name="width" value="100%" class="col-span-3 h-8" />
            </div>
            <div class="grid grid-cols-5 items-center gap-4">
              <Label class="col-span-2" for="maxWidth">
                Max. width
              </Label>
              <Input name="maxWidth" value="300px" class="col-span-3 h-8" />
            </div>
            <div class="grid grid-cols-5 items-center gap-4">
              <Label class="col-span-2" for="height">
                Height
              </Label>
              <Input name="height" value="25px" class="col-span-3 h-8" />
            </div>
            <div class="grid grid-cols-5 items-center gap-4">
              <Label class="col-span-2" for="maxHeight">
                Max. height
              </Label>
              <Input name="maxHeight" value="none" class="col-span-3 h-8" />
            </div>
          </div>
        </div>
      </Popover.Panel>
    </Popover.Root>
  );
});
`;export{r as H,t as a};
