import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as s}from"./q-CsvfasCP.js";const a=r(s(()=>e(()=>import("./q-CMCHSeRt.js").then(o=>o.w),[]),"s_0KYzGhbinG0")),i=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'pink'];

  return (
    <Carousel.Root class="carousel-root" gap={30}>
      <div class="carousel-buttons">
        <Carousel.Previous>Prev</Carousel.Previous>
        <Carousel.Next>Next</Carousel.Next>
      </div>
      {colors.map((color) => (
        <Carousel.Slide key={color} class="carousel-slide">
          {color}
        </Carousel.Slide>
      ))}
    </Carousel.Root>
  );
});
// internal
import styles from './carousel.css?inline';
`;export{i as W,a};
