import{_ as s}from"./q-BKZ00VYc.js";import{t as o,N as r}from"./q-CsvfasCP.js";const n=o(r(()=>s(()=>import("./q-D9t1Brr-.js").then(e=>e.s),[]),"s_toSRK0Fsmeo")),l=`import { component$, useComputed$, useSignal } from '@builder.io/qwik';
import { Card, Carousel, Separator } from '@qwik-ui/styled';
import { cn } from '@qwik-ui/utils';

export default component$(() => {
  const steps = ['Address', 'Shipping', 'Payment'];
  const progress = useSignal(0);
  const progressIndex = useComputed$(() => Math.floor(progress.value / 50));
  return (
    <Carousel.Root class="w-full" bind:progress={progress}>
      <Carousel.Stepper class="pl-4">
        {steps.map((title, index) => (
          <>
            <Carousel.Step key={index}>
              <span
                class={cn(
                  'flex size-8 items-center justify-center rounded-full bg-muted text-xl font-semibold',
                  progressIndex.value >= index && 'bg-primary text-primary-foreground',
                )}
              >
                {index + 1}
              </span>
              <span class="font-semibold">{title}</span>
            </Carousel.Step>
            {index < steps.length - 1 && (
              <div class="mx-2 grow">
                <Separator
                  class={cn(progressIndex.value > index ? 'bg-foreground' : 'bg-muted')}
                />
              </div>
            )}
          </>
        ))}
      </Carousel.Stepper>
      {Array.from({ length: 3 }).map((_, index) => (
        <Carousel.Slide key={index}>
          <div class="p-1">
            <Card.Root>
              <Card.Content class="flex h-40 w-full items-center justify-center">
                <span class="text-4xl font-semibold">{index + 1}</span>
              </Card.Content>
            </Card.Root>
          </div>
        </Carousel.Slide>
      ))}
    </Carousel.Root>
  );
});
`;export{l as S,n as a};
