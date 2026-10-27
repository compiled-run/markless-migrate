import{_ as t}from"./q-BKZ00VYc.js";import{t as a,N as s}from"./q-CsvfasCP.js";const n=a(s(()=>t(()=>import("./q-5qyHrGWM.js").then(e=>e.h),[]),"s_BziKrHgSoeg")),l=`import { component$, useSignal, useStyles$ } from '@builder.io/qwik';
import { Pagination } from '@qwik-ui/headless';
import styles from '../index.css?inline';

export default component$(() => {
  useStyles$(styles);
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
`;export{l as H,n as a};
