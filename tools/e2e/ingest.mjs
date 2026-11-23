import { open, BASE } from './common.mjs';
const [query, pick] = [process.argv[2], Number(process.argv[3] || 0)];
const { ctx, page } = await open();
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.fill('input', query);
await page.click('button[type=submit]');
await page.waitForSelector('ul li button', { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `search-${query.replace(/\W+/g,'_')}.png` });
const items = await page.$$eval('ul li button', bs => bs.map(b => b.innerText.replace(/\n/g,' | ')));
console.log(items);
await page.locator('ul li button').nth(pick).click();
const t0 = Date.now();
while (Date.now() - t0 < 300000) {
  if (page.url().includes('/song/')) break;
  const txt = await page.locator('main').innerText().catch(()=> '');
  const m = txt.match(/\d+%/); if (m) process.stdout.write(m[0] + ' ');
  if (/error|failed|couldn/i.test(txt)) { console.log('\n' + txt.slice(0, 600)); }
  await page.waitForTimeout(3000);
}
console.log('\nURL', page.url());
await page.waitForTimeout(3000);
await page.screenshot({ path: `song-${query.replace(/\W+/g,'_')}.png` });
await ctx.close();
