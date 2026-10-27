import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as s}from"./q-CsvfasCP.js";const t=r(s(()=>e(()=>import("./q-DrGsa4IC.js").then(o=>o.t),[]),"s_W2daBZW5arU")),u=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];

  return (
    <Carousel.Root class="carousel-root" gap={30}>
      <Carousel.Title>Favorite Colors</Carousel.Title>
      <div class="carousel-buttons">
        <Carousel.Previous>Prev</Carousel.Previous>
        <Carousel.Next>Next</Carousel.Next>
      </div>
      <Carousel.Scroller class="carousel-scroller">
        {colors.map((color) => (
          <Carousel.Slide key={color} class="carousel-slide">
            {color}
          </Carousel.Slide>
        ))}
      </Carousel.Scroller>
    </Carousel.Root>
  );
});
// internal
import styles from './carousel.css?inline';
`;export{u as T,t as a};
