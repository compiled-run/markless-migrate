import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ javaScriptEnabled: false });
await p.goto('http://127.0.0.1:4420/directives/model');
const data = await p.evaluate(() => {
  const ul = document.querySelector('aside[hover-scrollbar] > ul');
  return [...ul.children].map((li) => {
    const head = li.querySelector(':scope > span.font-medium');
    if (!head) { const a = li.querySelector('a'); return { kind: 'link', cls: li.className, href: a.getAttribute('href'), label: a.textContent.trim(), html: li.outerHTML.length }; }
    return { kind: 'section', title: head.textContent.trim(), items: [...li.querySelectorAll(':scope > ul > li')].map((i) => { const a = i.querySelector('a'); return { href: a.getAttribute('href'), prefix: a.querySelector('span')?.textContent.trim() ?? '', label: [...a.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(), cls: i.className, style: i.getAttribute('style') }; }) };
  });
});
console.log(JSON.stringify(data, null, 1));
await b.close();
