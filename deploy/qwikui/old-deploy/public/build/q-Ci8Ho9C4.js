import{_ as e}from"./q-BKZ00VYc.js";import{t as o,N as r}from"./q-CsvfasCP.js";const a=o(r(()=>e(()=>import("./q-DYsnsjY2.js"),[]),"s_mGF0og4w6LQ")),t=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];

  return (
    <Carousel.Root class="carousel-root" gap={30} align="center">
      <div class="carousel-buttons">
        <Carousel.Previous>Prev</Carousel.Previous>
        <Carousel.Next>Next</Carousel.Next>
      </div>
      <Carousel.Scroller class="carousel-scroller">
        {colors.map((color) => (
          <Carousel.Slide
            style={{ flexBasis: '300px' }}
            key={color}
            class="carousel-slide"
          >
            {color}
          </Carousel.Slide>
        ))}
      </Carousel.Scroller>
    </Carousel.Root>
  );
});
// internal
import styles from './carousel.css?inline';
`;export{t as C,a};
