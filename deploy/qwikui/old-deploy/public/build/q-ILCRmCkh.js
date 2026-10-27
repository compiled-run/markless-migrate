import{_ as e}from"./q-BKZ00VYc.js";import{t,N as s}from"./q-CsvfasCP.js";const n=t(s(()=>e(()=>import("./q-Bygt11DQ.js"),[]),"s_i6BHhqgbtBU")),i=`import { component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
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
        customArrowTexts={{ previous: 'LEFT', next: 'RIGHT' }}
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
`;export{i as C,n as a};
