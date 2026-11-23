import { open, BASE } from './common.mjs';
const [id, lineIdx, secs, out, view] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), process.argv[5], process.argv[6]];
const { ctx, page } = await open({ args: ['--autoplay-policy=no-user-gesture-required'] });
await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const lines = page.locator('main section .space-y-1 > div');
const texts = await lines.allInnerTexts();
console.log(texts.map((t,i)=>i+': '+t.replace(/\n/g,' / ')).slice(0,30).join('\n'));
await lines.nth(lineIdx).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Play', exact: true }).first().click();
await page.waitForTimeout(secs * 1000);
if (view) { await page.getByRole('tab', { name: view, exact: true }).click(); await page.waitForTimeout(800); }
const exp = page.getByRole('button', { name: /expand/i });
if (await exp.count()) { await exp.first().click(); console.log('expanded'); }
await page.waitForTimeout(1200);
console.log('playing?', await page.getByRole('button', { name: 'Pause', exact: true }).count());
await page.screenshot({ path: out });
await ctx.close();
