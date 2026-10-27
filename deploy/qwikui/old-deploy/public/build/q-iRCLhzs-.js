import{_ as e}from"./q-BKZ00VYc.js";import{t as r,N as o}from"./q-CsvfasCP.js";const a=r(o(()=>e(()=>import("./q-BQ54GFeB.js"),[]),"s_LHdMqO7U5mQ")),t=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  return (
    <Carousel.Root class="carousel-root" gap={30}>
      <Carousel.Stepper class="carousel-stepper">
        {Array.from({ length: 3 }).map((_, index) => (
          <Carousel.Step class="carousel-step">Header {index + 1}</Carousel.Step>
        ))}
      </Carousel.Stepper>

      <Carousel.Scroller class="carousel-scroller">
        {Array.from({ length: 3 }).map((_, index) => (
          <Carousel.Slide class="carousel-slide">Content {index + 1}</Carousel.Slide>
        ))}
      </Carousel.Scroller>
    </Carousel.Root>
  );
});
// internal
import styles from './carousel.css?inline';
`;export{t as S,a};
