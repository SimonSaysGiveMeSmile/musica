// Shared Playwright launcher for the Musica end-to-end drivers.
//
// Rescued 2026-10-31 from a temp scratchpad belonging to an unrelated project,
// where these were the only surviving browser-test tooling for this repo.
// The original hardcoded `createRequire('/Users/test/Desktop/Side-Proj/idiet/node_modules/')`
// has been replaced with a resolution chain so these do not break when an
// unrelated repo is pruned or moved.
//
// Playwright is NOT a dependency of this repo. Resolution order:
//   1. $PLAYWRIGHT_DIR            (e.g. /path/to/some/node_modules/)
//   2. this repo's web/node_modules
//   3. a plain `playwright` resolve (global / npx / parent node_modules)
// Install one of those, or run: npx --yes playwright@latest install chromium
import { createRequire } from 'module';

const HERE = new URL('.', import.meta.url).pathname;
const CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  `${HERE}../../web/node_modules/`,
  import.meta.url,
].filter(Boolean);

function loadPlaywright() {
  const errors = [];
  for (const base of CANDIDATES) {
    try {
      return createRequire(base)('playwright');
    } catch (e) {
      errors.push(`  ${base} -> ${e.code || e.message}`);
    }
  }
  throw new Error(
    `Could not resolve "playwright". Tried:\n${errors.join('\n')}\n` +
    `Set PLAYWRIGHT_DIR to a node_modules directory that has it, or install it.`
  );
}

export const { chromium } = loadPlaywright();

// Persistent profile keeps the IndexedDB song library between runs.
// Overridable so throwaway runs do not mutate the saved library.
export const PROFILE = process.env.MUSICA_PROFILE || new URL('./profile', import.meta.url).pathname;

// Defaults to production. Point at localhost:3100 to drive a local build
// (note: port 3000 on this Mac is taken by an unrelated process).
export const BASE = process.env.MUSICA_BASE || 'https://www.musicaa.site';

export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

export async function open(extra = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: UA, colorScheme: 'dark', locale: 'en-US', ...extra,
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  return { ctx, page };
}
