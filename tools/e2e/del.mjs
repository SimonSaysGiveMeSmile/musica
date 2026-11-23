// Delete a song from the library by name.
//   node del.mjs "The Beatles - Let It Be"
// Matches the Delete button by accessible name, so pass enough of the title to be unique.
import { open, BASE } from './common.mjs';

const title = process.argv[2];
if (!title) {
  console.error('usage: node del.mjs "<song title as shown in the library>"');
  process.exit(1);
}
const { ctx, page } = await open();
await page.goto(BASE + '/library', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
await page.getByRole('button', { name: new RegExp(`Delete ${esc}`) }).click();
await page.waitForTimeout(800);
await ctx.close();
console.log('deleted:', title);
