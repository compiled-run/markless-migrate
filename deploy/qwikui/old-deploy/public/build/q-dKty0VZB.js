import{_ as s}from"./q-BKZ00VYc.js";import{t as o,N as r}from"./q-CsvfasCP.js";const a=o(r(()=>s(()=>import("./q-tHvfaPL3.js").then(e=>e.v),[]),"s_RbUqvAXP8sc")),p=`import { component$, useStyles$ } from '@builder.io/qwik';
import { Carousel } from '@qwik-ui/headless';

export default component$(() => {
  useStyles$(styles);

  const space = { marginBlock: '1rem' };

  return (
    <Carousel.Root class="carousel-root" gap={30}>
      {/* example stepper css uses flex for horizontal examples */}
      <Carousel.Stepper class="carousel-stepper" style={{ flexDirection: 'column' }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <>
            <Carousel.Step class="carousel-step">Header {index + 1}</Carousel.Step>
            <Carousel.Slide style={space} class="carousel-slide">
              Content {index + 1}
            </Carousel.Slide>
          </>
        ))}
      </Carousel.Stepper>
    </Carousel.Root>
  );
});
// internal
import styles from './carousel.css?inline';
`;export{p as V,a};
