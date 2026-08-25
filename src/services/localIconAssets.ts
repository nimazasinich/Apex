import fs from 'node:fs';
import path from 'node:path';

import { ICON_ASSET_PATTERN } from './iconProxy';

/**
 * Server-side resolution of the coin artwork that ships inside the repository,
 * so `/api/icon/:asset` can answer from disk instead of reaching a CDN.
 *
 * Why this is a separate module rather than a branch inside `IconProxy`:
 * `IconProxy` is a pure network cache whose unit tests assert exact upstream
 * call counts against an injected `fetchImpl`. Teaching it to short-circuit on
 * local files would silently zero out those counts for btc/eth/sol and make the
 * suite pass for the wrong reason. Keeping disk resolution here leaves the proxy
 * and its tests honest, and makes the precedence rule visible in the route.
 *
 * Node-only (`node:fs`), matching the existing convention for `src/services`
 * modules that the Express server imports.
 */

export interface LocalIconAsset {
  body: Buffer;
  contentType: string;
}

/**
 * `dist` first so a built release serves exactly the bytes it shipped, then
 * `public` so the same route works in dev before anything is built. Resolved
 * against `process.cwd()` to match how `server.ts` locates `dist` for
 * `express.static`.
 */
const ICON_DIRECTORIES = ['dist/crypto-icons', 'public/crypto-icons'] as const;

/**
 * Bounded because a caller controls the key. Negative lookups are cached too —
 * that is the whole point, it stops a long-tail symbol from hitting the disk on
 * every render — but the asset pattern still allows a large key space, so the
 * map cannot be allowed to grow without limit. Insertion-ordered eviction is
 * enough here: entries are immutable facts about files on disk, so which one is
 * dropped only affects one extra `statSync`, never correctness.
 */
const MAX_CACHE_ENTRIES = 1_024;
const cache = new Map<string, LocalIconAsset | null>();

function remember(asset: string, value: LocalIconAsset | null): LocalIconAsset | null {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(asset, value);
  return value;
}

/**
 * Read the shipped PNG for `asset`, or null when the app ships none.
 *
 * `asset` is validated against the same pattern the proxy enforces before it is
 * joined onto a path, so `..` and separators cannot escape the icon directory.
 */
export function readLocalIcon(asset: string): LocalIconAsset | null {
  if (!ICON_ASSET_PATTERN.test(asset)) return null;

  const cached = cache.get(asset);
  if (cached !== undefined) return cached;

  for (const directory of ICON_DIRECTORIES) {
    const file = path.resolve(process.cwd(), directory, `${asset}.png`);
    try {
      const body = fs.readFileSync(file);
      if (body.length > 0) return remember(asset, { body, contentType: 'image/png' });
    } catch {
      // Missing in this directory: fall through to the next one, then to the proxy.
    }
  }

  return remember(asset, null);
}

/** True when the app ships artwork for `asset` on disk. */
export function hasLocalIcon(asset: string): boolean {
  return readLocalIcon(asset) !== null;
}

/** Test seam: drops memoised lookups so a fixture directory can be swapped. */
export function clearLocalIconCache(): void {
  cache.clear();
}
