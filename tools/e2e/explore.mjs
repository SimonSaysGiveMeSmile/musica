import { open, BASE } from './common.mjs';
const { ctx, page } = await open();
const id = process.argv[2] || 'yt%3ACGj85pVzRJs';
await page.goto(BASE + '/library', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.screenshot({ path: 'x-library.png' });
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.screenshot({ path: 'x-home.png' });
await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
await page.screenshot({ path: 'x-sheet.png' });
for (const v of ['Beats', 'Chords', 'Learn']) {
  await page.getByRole('tab', { name: v, exact: true }).first().click().catch(e => console.log(v, e.message));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `x-${v}.png` });
}
await page.goto(BASE + '/song/' + id + '/tutorial', { waitUntil: 'networkidle' }); await page.waitForTimeout(4000);
await page.screenshot({ path: 'x-tutorial.png' });
await page.goto(BASE + '/me', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.screenshot({ path: 'x-me.png' });
await ctx.close();
