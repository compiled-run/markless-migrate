/**
 * A grid built from divs, the way AG Grid and its kind build theirs: ARIA roles, listeners added
 * from script, no native controls inside. Headers sort on click and Enter, a filter button (a span)
 * opens a filter box that filters as you type, rows select on click and Space and move focus with
 * the arrow keys, and a span in each row opens its details.
 */
export function gridPage(options: { sorts: boolean }): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Events</title>
<style>.row[aria-selected="true"] { background: #def } .filter { cursor: pointer } #popup[hidden] { display: none }</style></head><body>
<main><h1>Events</h1>
<div role="grid" aria-label="Events" aria-rowcount="4">
  <div role="row" class="head">
    <div role="columnheader" aria-sort="none" tabindex="0" data-key="name">Name</div>
    <div role="columnheader" aria-sort="none" tabindex="0" data-key="size">Size <span class="filter">Filter</span></div>
  </div>
  <div id="body"></div>
</div>
<div id="popup" hidden><input aria-label="Size at least" type="number"></div>
<p id="details" aria-live="polite"></p>
</main>
<script>
const rows = [{ name: 'gamma', size: 3 }, { name: 'alpha', size: 12 }, { name: 'beta', size: 7 }];
let shown = rows.slice();
let min = 0;
const body = document.getElementById('body');
function render() {
  body.replaceChildren(...shown.filter((r) => r.size >= min).map((r) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'row';
    row.tabIndex = 0;
    row.setAttribute('aria-selected', 'false');
    row.innerHTML = '<div role="gridcell">' + r.name + '</div><div role="gridcell">' + r.size + ' <span class="open">Open ' + r.name + '</span></div>';
    const select = () => { for (const other of body.children) other.setAttribute('aria-selected', String(other === row)); };
    row.addEventListener('click', select);
    row.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); select(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); (row.nextElementSibling || row).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (row.previousElementSibling || row).focus(); }
    });
    row.querySelector('.open').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('details').textContent = r.name + ' is ' + r.size + ' bytes'; });
    return row;
  }));
}
for (const header of document.querySelectorAll('[role="columnheader"]')) {
  const sort = () => {
    ${options.sorts ? `const key = header.dataset.key;
    const next = header.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const h of document.querySelectorAll('[role="columnheader"]')) h.setAttribute('aria-sort', 'none');
    header.setAttribute('aria-sort', next);
    shown.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (next === 'ascending' ? 1 : -1));
    render();` : ''}
  };
  header.addEventListener('click', sort);
  header.addEventListener('keydown', (e) => { if (e.key === 'Enter') sort(); });
}
document.querySelector('.filter').addEventListener('click', (e) => { e.stopPropagation(); const popup = document.getElementById('popup'); popup.hidden = !popup.hidden; });
document.querySelector('#popup input').addEventListener('input', (e) => { min = Number(e.target.value) || 0; render(); });
render();
</script></body></html>`;
}
