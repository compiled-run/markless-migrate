import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const pending = new Map();
p.on('request', (r) => pending.set(r, Date.now())); p.on('requestfinished', (r) => pending.delete(r)); p.on('requestfailed', (r) => pending.delete(r));
const t = Date.now();
try { await p.goto(process.argv[2], { waitUntil: 'load', timeout: 20000 }); console.log('load ms', Date.now() - t); } catch (e) { console.log('TIMEOUT'); }
for (const [r] of pending) console.log('pending', r.resourceType(), r.url().slice(0, 120));
await b.close();
