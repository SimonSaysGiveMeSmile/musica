import { open, BASE } from './common.mjs';
const [id, lineIdx, secs, out, topLine] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), process.argv[5], Number(process.argv[6])];
const { ctx, page } = await open({ args: ['--autoplay-policy=no-user-gesture-required'] });
await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
await page.evaluate(() => { const k='musica.prefs.v1'; const p=JSON.parse(localStorage.getItem(k)||'{}'); p.playerCollapsed=false; localStorage.setItem(k, JSON.stringify(p)); });
await page.goto(BASE + '/song/' + id, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
const lines = page.locator('main section .space-y-1 > div');
await lines.nth(lineIdx).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Play', exact: true }).first().click();
await page.waitForTimeout(secs * 1000);
// align line `topLine` just under the sticky header
if (topLine >= 0) await page.evaluate((n) => { const el = document.querySelectorAll('main section .space-y-1 > div')[n]; const hb = document.querySelector('header').getBoundingClientRect().bottom; window.scrollBy(0, el.getBoundingClientRect().top - hb - 6); }, topLine);
await page.waitForTimeout(1500);
console.log('playing', await page.getByRole('button', { name: 'Pause', exact: true }).count(), 'hdr hidden', await page.locator('header[data-hidden]').count());
await page.screenshot({ path: out });
await ctx.close();
