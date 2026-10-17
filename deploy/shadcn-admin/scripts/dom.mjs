// Prints the rendered DOM of a route (body and the classes on <html>) so a port can match its markup.
import { chromium } from 'playwright';
const [url] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
process.stdout.write(await p.evaluate(() => `<!-- html class="${document.documentElement.className}" style="${document.documentElement.getAttribute('style') ?? ''}" -->\n${document.body.outerHTML}`));
await b.close();
