/**
 * Shipped coin-icon manifest — GENERATED, do not hand-edit.
 *
 * Every entry is the basename of a PNG that exists in `public/crypto-icons/`
 * and is therefore copied into `dist/crypto-icons/` by the Vite build and into
 * the release archive by createReleaseArchive. Keeping this an explicit list
 * rather than a build-time glob preserves the property the old 25-entry manifest
 * had: the mapping is deterministic and reviewable in a diff, and a file that
 * disappears from disk shows up as a failing lookup rather than silently
 * degrading to initials.
 *
 * Provenance: the top 300 tickers by market cap (CoinGecko
 * /coins/markets, market_cap_desc, captured 2026-08-24), one entry per ticker
 * with the highest-ranked coin winning. Artwork resolved per symbol through a
 * fallback chain: cryptocurrency-icons@0.18.1 (128px) -> CoinGecko coin image
 * (small, transcoded to PNG when served as JPEG/WEBP) -> CoinCap -> CoinStats.
 *   sources: already-present=23, coincap=27, coingecko-small=182, coingecko-small+png-convert=28, cryptocurrency-icons=40
 *   symbols that failed every source: none — all 300 resolved
 *   retained beyond the top 300 (pre-existing artwork, alias targets): ['eos', 'matic']
 *   302 files, 958 KiB total
 *
 * Why this exists: coin icons used to be fetched on demand through
 * `/api/icon/:asset` -> `src/services/iconProxy.ts` -> a public CDN. On a host
 * whose only egress to two of the three allowlisted CDNs is a local proxy, each
 * symbol the CDN did not carry cost two 4s connect timeouts before falling back
 * to a monogram, and the browser's 6-connections-per-origin cap meant a table of
 * unknown symbols starved the icons that WERE available. Shipping the artwork
 * removes runtime fetching from the common path entirely.
 */

export const SHIPPED_COIN_ICONS: ReadonlySet<string> = new Set([
  '1inch', '2z', 'a', 'a7a5', 'aave', 'ab', 'acred', 'ada',
  'aero', 'ake', 'akt', 'alfw', 'algo', 'ansem', 'ape', 'apepe',
  'apt', 'apxusd', 'apyusd', 'ar', 'arb', 'aster', 'ath', 'atom',
  'ausd', 'avax', 'avusd', 'awe', 'axs', 'b', 'bananas31', 'bat',
  'bcap', 'bch', 'bdx', 'bfusd', 'bgb', 'bnb', 'bonk', 'borg',
  'bp', 'bspx', 'bsv', 'btc', 'btse', 'btt', 'btw', 'buidl',
  'cake', 'cap', 'cards', 'cash', 'cashcat', 'cc', 'cfx', 'cheems',
  'chz', 'coco', 'comp', 'crclb', 'crclon', 'cro', 'crv', 'crvusd',
  'cusd', 'cvx', 'cys', 'dai', 'dash', 'dbr', 'dcr', 'dgb',
  'dog', 'doge', 'dot', 'drv', 'dydx', 'edge', 'egld', 'eigen',
  'ena', 'ens', 'eos', 'etc', 'eth', 'ethfi', 'eurc', 'eurcv',
  'eursafo', 'eutbl', 'fartcoin', 'fdusd', 'fet', 'ff', 'fil', 'floki',
  'flr', 'fluid', 'form', 'frax', 'frxusd', 'gala', 'genius', 'geod',
  'ggbr', 'gho', 'glm', 'gno', 'gomining', 'gram', 'grass', 'grt',
  'grx', 'gt', 'gusd', 'h', 'hash', 'hbar', 'htx', 'hype',
  'icp', 'imx', 'inj', 'iota', 'jaaa', 'jasmy', 'jpysc', 'jst',
  'jto', 'jtrsy', 'jup', 'kag', 'kaia', 'kaito', 'kas', 'kau',
  'kcs', 'kite', 'kmno', 'koge', 'ldo', 'leo', 'link', 'lit',
  'ltc', 'lunc', 'm', 'mana', 'matic', 'melania', 'met', 'meta',
  'mnt', 'mon', 'morpho', 'mx', 'near', 'neo', 'nex', 'nexo',
  'nft', 'night', 'npc', 'nxm', 'ohm', 'okb', 'ondo', 'onyc',
  'op', 'ordi', 'ousg', 'ozo', 'paxg', 'pc0000015', 'pc0000031', 'pc0000033',
  'pc0000077', 'pc0000085', 'pc0000097', 'pendle', 'pengu', 'pepe', 'pgold', 'pi',
  'pieverse', 'plume', 'pol', 'pump', 'pyth', 'pyusd', 'q', 'qnt',
  'qtum', 'rail', 'rain', 'ray', 're', 'real', 'render', 'reusd',
  'rlb', 'rlusd', 'rsr', 'rune', 's', 'safe', 'safo', 'sand',
  'sei', 'sent', 'sfp', 'shfl', 'shib', 'short', 'sky', 'sn51',
  'sn64', 'snx', 'sofid', 'sol', 'soso', 'spx', 'stable', 'stac',
  'stau', 'strcx', 'strk', 'stx', 'sui', 'sun', 'super', 'syrup',
  'tag', 'tao', 'tel', 'thbill', 'theta', 'tia', 'tibbir', 'trac',
  'trump', 'trx', 'tusd', 'twt', 'u', 'uai', 'ub', 'ultima',
  'uni', 'up', 'usat', 'usd0', 'usd1', 'usda', 'usdai', 'usdat',
  'usdc', 'usdd', 'usde', 'usdf', 'usdg', 'usdgo', 'usds', 'usdt',
  'usdtb', 'usdy', 'ustb', 'ustbl', 'usx', 'usyc', 'uusd', 'velvet',
  'vet', 'virtual', 'vsn', 'vvv', 'wbt', 'wemix', 'wif', 'wld',
  'wlfi', 'wm', 'xaut', 'xcn', 'xdc', 'xec', 'xlm', 'xmr',
  'xpl', 'xrp', 'xtz', 'yfi', 'ylds', 'yzy', 'zama', 'zano',
  'zbcn', 'zec', 'zen', 'zk', 'zro', 'zrx',
]);

/** True when `public/crypto-icons/<asset>.png` ships with the app. */
export function hasShippedCoinIcon(asset: string): boolean {
  return SHIPPED_COIN_ICONS.has(asset);
}
