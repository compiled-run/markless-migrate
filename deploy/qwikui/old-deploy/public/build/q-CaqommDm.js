import{_ as e}from"./q-BKZ00VYc.js";import{t as s,N as r}from"./q-CsvfasCP.js";const a=s(r(()=>e(()=>import("./q-DRZ0u_Y9.js").then(o=>o.s),[]),"s_960FZurWFGA")),i=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];

  return (
    <Carousel.Root
      class="carousel-root"
      gap={30}
      sensitivity={{
        mouse: 2.5,
        touch: 2.25,
      }}
    >
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
`;export{i as S,a};
