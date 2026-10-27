import{_ as e}from"./q-BKZ00VYc.js";import{t as s,N as t}from"./q-CsvfasCP.js";const n=s(t(()=>e(()=>import("./q-BbSmcQLl.js"),[]),"s_SVhy8fqVnw0")),i=`import { component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
import { Pagination } from '@qwik-ui/headless';
import styles from '../index.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const selectedPage = useSignal(5);
  const totalPages = useSignal(20);

  return (
    <div class="mt-4 flex flex-col gap-6">
      <Pagination
        selectedPage={selectedPage.value}
        totalPages={totalPages.value}
        onPageChange$={(page: number) => {
          selectedPage.value = page;
        }}
        class="pagination-wrapper"
        selectedClass="pagination-selected-btn"
        defaultClass="pagination-btn"
        dividerClass="pagination-divider"
        prevButtonClass="prevNextButtons"
        nextButtonClass="prevNextButtons"
      >
        <span q:slot="prefix"> 👈 </span>
        <span q:slot="suffix"> 👉 </span>
      </Pagination>
    </div>
  );
});
`;export{i as C,n as a};
