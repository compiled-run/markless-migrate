import{_ as t}from"./q-BKZ00VYc.js";import{t as a,N as s}from"./q-CsvfasCP.js";const l=a(s(()=>t(()=>import("./q-gBF3QZjs.js").then(e=>e.d),[]),"s_hTVqiH0W0H4")),n=`import { component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
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
        disabled
        onPageChange$={(page: number) => {
          selectedPage.value = page;
        }}
        class="pagination-wrapper"
        selectedClass="pagination-selected-btn"
        defaultClass="pagination-btn"
        dividerClass="pagination-divider"
        prevButtonClass="prevNextButtons"
        nextButtonClass="prevNextButtons"
      />
    </div>
  );
});
`;export{n as D,l as a};
