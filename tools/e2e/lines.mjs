import { open, BASE } from './common.mjs';
const { ctx, page } = await open();
for (const id of process.argv.slice(2)) {
  await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const t = await page.locator('main section .space-y-1 > div').allInnerTexts();
  console.log('==', id, await page.locator('header').innerText().then(s=>s.replace(/\n/g,' | ')));
  console.log(t.slice(0,7).map((x,i)=>i+': '+x.replace(/\n/g,' / ')).join('\n'));
}
await ctx.close();
