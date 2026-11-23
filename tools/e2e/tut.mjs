import { open, BASE } from './common.mjs';
const [id, instr, secs, out] = process.argv.slice(2);
const { ctx, page } = await open({ args: ['--autoplay-policy=no-user-gesture-required'] });
await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByRole('button', { name: new RegExp('^' + instr + '$', 'i') }).first().click(); await page.waitForTimeout(500);
await page.goto(BASE + '/song/' + id + '/tutorial', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
const txt = await page.locator('main').innerText();
console.log(txt.replace(/\n/g,' | ').slice(0, 400));
const choice = page.locator('main button', { hasText: /Arrange|Melody|arrangement/i }).first();
if (await choice.count()) {
  await choice.click(); console.log('building');
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) { await page.waitForTimeout(3000); if (await page.locator('canvas').count()) break; }
  console.log('built after', (Date.now()-t0)/1000);
}
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Play', exact: true }).first().click();
await page.waitForTimeout(Number(secs) * 1000);
await page.screenshot({ path: out });
console.log((await page.locator('main').innerText()).replace(/\n/g,' | ').slice(0, 300));
await ctx.close();
