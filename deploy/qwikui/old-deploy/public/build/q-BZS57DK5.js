import{_ as o}from"./q-BKZ00VYc.js";import{t as e,N as a}from"./q-CsvfasCP.js";const l=e(a(()=>o(()=>import("./q-CwYBXdy2.js"),[]),"s_DdF7EUf5mmQ")),s=`import { component$ } from '@builder.io/qwik';
import { Card, Carousel } from '@qwik-ui/styled';

export default component$(() => {
  return (
    <Carousel.Root class="max-w-xs">
      <Carousel.Scroller>
        {Array.from({ length: 5 }).map((_, index) => (
          <Carousel.Slide key={index}>
            <div class="p-1">
              <Card.Root>
                <Card.Content class="flex aspect-square items-center justify-center">
                  <span class="text-4xl font-semibold">{index + 1}</span>
                </Card.Content>
              </Card.Root>
            </div>
          </Carousel.Slide>
        ))}
      </Carousel.Scroller>
      <Carousel.Pagination>
        <Carousel.Bullet />
        <Carousel.Bullet />
        <Carousel.Bullet />
        <Carousel.Bullet />
        <Carousel.Bullet />
      </Carousel.Pagination>
    </Carousel.Root>
  );
});
`;export{s as P,l as a};
