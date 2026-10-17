import { chromium } from '/Users/jacksm5pro/dev/open-source/markless-migrate/node_modules/playwright/index.mjs';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:3100/login'); await p.getByLabel('Email').fill('user@nextmail.com'); await p.getByLabel('Password').fill('123456'); await p.getByRole('button', { name: 'Log in' }).click(); await p.waitForURL(/dashboard/);
const cookies = await p.context().cookies(); console.log(cookies.map(c => `${c.name}=${c.value}`).join('; ')); await b.close();
