import { open, BASE } from './common.mjs';
// usage: id lineIdx secs view collapsed(0/1) out [instrument]
const [id, lineIdx, secs, view, collapsed, out, instr] = process.argv.slice(2);
const { ctx, page } = await open({ args: ['--autoplay-policy=no-user-gesture-required'] });
await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
await page.evaluate((c) => { const k='musica.prefs.v1'; const p=JSON.parse(localStorage.getItem(k)||'{}'); p.playerCollapsed=c; localStorage.setItem(k, JSON.stringify(p)); }, collapsed === '1');
await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
if (instr) { await page.getByRole('button', { name: new RegExp('^' + instr + '$', 'i') }).first().click(); await page.waitForTimeout(500); }
if (Number(lineIdx) >= 0) {
  await page.locator('main section .space-y-1 > div').nth(Number(lineIdx)).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await page.waitForTimeout(Number(secs) * 1000);
  await page.evaluate(() => window.scrollTo(0, 0));
}
if (view !== 'Sheet') { await page.getByRole('tab', { name: view, exact: true }).click(); }
await page.waitForTimeout(1800);
await page.screenshot({ path: out });
await ctx.close();
