import{_ as o}from"./q-BKZ00VYc.js";import{t as e,N as r}from"./q-CsvfasCP.js";const t=e(r(()=>o(()=>import("./q-Bdzbx5rR.js"),[]),"s_k9s33z0T46s")),l=`import { component$ } from '@builder.io/qwik';
import { Card, Carousel } from '@qwik-ui/styled';

export default component$(() => {
  return (
    <Carousel.Root class="max-w-xs">
      <Carousel.Scroller class="m-2">
        {Array.from({ length: 9 }).map((_, index) => (
          <Carousel.Slide key={index}>
            <div class="px-2 py-3">
              <Card.Root>
                <Card.Content class="flex aspect-square items-center justify-center">
                  <span class="text-4xl font-semibold">{index + 1}</span>
                </Card.Content>
              </Card.Root>
            </div>
          </Carousel.Slide>
        ))}
      </Carousel.Scroller>
      <Carousel.Previous />
      <Carousel.Next />
    </Carousel.Root>
  );
});
`;export{l as H,t as a};
