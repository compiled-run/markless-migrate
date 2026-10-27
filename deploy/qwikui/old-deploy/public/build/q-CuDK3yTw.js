import{_ as o}from"./q-BKZ00VYc.js";import{t as e,N as s}from"./q-CsvfasCP.js";const a=e(s(()=>o(()=>import("./q-CzyxUcSl.js"),[]),"s_gMTqmSvNgqc")),t=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];

  return (
    <Carousel.Root class="carousel-root" gap={30} align="end">
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
`;export{t as E,a};
