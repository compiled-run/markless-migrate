import{_ as a}from"./q-BKZ00VYc.js";import{t as s,N as l}from"./q-CsvfasCP.js";const r=s(l(()=>a(()=>import("./q-vo4Ry3a2.js").then(e=>e.s),[]),"s_YRhqLSKJf7g")),g=`import { component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
import { Pagination } from '@qwik-ui/headless';
import styles from '../index.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const selectedPage = useSignal(1);
  const totalPages = useSignal(10);

  return (
    <div class="mt-4 flex flex-col gap-6">
      <Pagination
        selectedPage={selectedPage.value}
        totalPages={totalPages.value}
        onPageChange$={(page: number) => {
          selectedPage.value = page;
        }}
        class="border border-foreground p-2"
        defaultClass="border border-primary p-4"
        selectedClass="border bg-alert p-4"
        dividerClass="bg-muted p-4"
      />

      <Pagination
        selectedPage={selectedPage.value}
        totalPages={totalPages.value}
        onPageChange$={(page: number) => {
          selectedPage.value = page;
        }}
        class="border border-foreground p-2"
        defaultClass="bg-primary w-8 h-8"
        selectedClass="bg-alert w-8 h-8"
        dividerClass="bg-muted h-8 px-2"
      />

      <Pagination
        selectedPage={selectedPage.value}
        totalPages={totalPages.value}
        onPageChange$={(page: number) => {
          selectedPage.value = page;
        }}
        class="flex flex-col items-center gap-2 border border-primary"
        defaultClass=""
        selectedClass=""
        dividerClass=""
      />
    </div>
  );
});
`;export{g as S,r as a};
