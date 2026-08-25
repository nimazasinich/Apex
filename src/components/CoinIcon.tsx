import React from 'react';

import { SHIPPED_COIN_ICONS } from '../lib/coinIconManifest';

type CoinIconProps = {
  symbol: string;
  size?: number;
  className?: string;
};

type CoinTheme = {
  bg: string;
  fg: string;
  glyph: 'btc' | 'eth' | 'letter';
};

const COIN_THEMES: Record<string, CoinTheme> = {
  BTC: { bg: '#fdecd2', fg: '#b45309', glyph: 'btc' },
  ETH: { bg: '#e6ecff', fg: '#3550c9', glyph: 'eth' },
  USDT: { bg: '#e1faf0', fg: '#0f9d67', glyph: 'letter' },
  USDC: { bg: '#e6f1ff', fg: '#2464d6', glyph: 'letter' },
  SOL: { bg: '#f2e9fe', fg: '#7c3aed', glyph: 'letter' },
  BNB: { bg: '#fdf3d8', fg: '#b8860b', glyph: 'letter' },
  XRP: { bg: '#eef1f4', fg: '#3a4552', glyph: 'letter' },
  ADA: { bg: '#e6f0fb', fg: '#1e5aa8', glyph: 'letter' },
  DOGE: { bg: '#faf1d6', fg: '#a17b0a', glyph: 'letter' },
  MATIC: { bg: '#f1e9fe', fg: '#6d28d9', glyph: 'letter' },
  DOT: { bg: '#fce8f3', fg: '#be1976', glyph: 'letter' },
  LTC: { bg: '#eef1f3', fg: '#4b5966', glyph: 'letter' },
  LINK: { bg: '#e6f0fe', fg: '#2b5fc7', glyph: 'letter' },
  AVAX: { bg: '#fde9e9', fg: '#c22c2c', glyph: 'letter' },
  TRX: { bg: '#fdeaea', fg: '#c4292f', glyph: 'letter' },
  ATOM: { bg: '#efeafd', fg: '#5b3ec8', glyph: 'letter' },
  OP: { bg: '#fde9e4', fg: '#c8391d', glyph: 'letter' },
  ARB: { bg: '#e7edf7', fg: '#2b3a67', glyph: 'letter' },
  SUI: { bg: '#e6f4fd', fg: '#1478b0', glyph: 'letter' },
  APT: { bg: '#eaeaf5', fg: '#2f2f6b', glyph: 'letter' },
};

const FALLBACK_THEME: CoinTheme = { bg: '#eef2f0', fg: '#4a5a52', glyph: 'letter' };

/**
 * Every asset without shipped artwork used to collapse onto one flat grey plate,
 * so a screen of them read as "icons failed to load" rather than "initials".
 * This derives a stable plate colour from the ticker itself: same symbol always
 * gets the same hue, different symbols separate visually.
 *
 * This is decoration, not data — it encodes nothing about the market and must
 * never be read as a signal. Lightness/saturation are fixed so contrast stays
 * constant across hues (light plate, dark ink) instead of varying per symbol.
 */
function derivedTheme(base: string): CoinTheme {
  if (!base) return FALLBACK_THEME;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) hash = (hash * 31 + base.charCodeAt(i)) % 360;
  return { bg: `hsl(${hash} 58% 94%)`, fg: `hsl(${hash} 52% 31%)`, glyph: 'letter' };
}

/**
 * Real logo artwork that ships with the app in `public/crypto-icons/`.
 *
 * The manifest is now GENERATED into `src/lib/coinIconManifest.ts` from what is
 * actually on disk (top 300 tickers by market cap) instead of being a 25-entry
 * list maintained by hand here. Same guarantee as before — every entry must
 * exist on disk, and the mapping stays deterministic and reviewable in a diff —
 * but it no longer has to be extended by hand for every newly listed asset.
 *
 * Deliberately local: no remote CDN URLs, so icons cannot break offline, on a
 * locked-down network, or when a third-party host rotates its paths.
 */

const LOGO_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  WBTC: 'BTC',
  BTCB: 'BTC',
  WETH: 'ETH',
  BETH: 'ETH',
  STETH: 'ETH',
  WSTETH: 'ETH',
  POL: 'MATIC',
  WMATIC: 'MATIC',
  WBNB: 'BNB',
  WSOL: 'SOL',
  MSOL: 'SOL',
  WAVAX: 'AVAX',
  BCHSV: 'BSV',
  XETH: 'ETH',
};

function extractBase(symbol: string): string {
  const cleaned = (symbol || '').toUpperCase().replace(/[-_]?PERP(ETUAL)?$/i, '');
  const [base] = cleaned.split(/[-_/]/);
  return (base || cleaned || '?').replace(/USDT$|USDC$|USD$/, '') || (base || '?');
}

/**
 * Canonical lowercase artwork key for a base ticker: alias first, then drop a
 * contract multiplier. Bybit lists 1000PEPE-USDT and the artwork is filed under
 * `pepe`, so this has to run before the local lookup too — not just before the
 * proxy lookup, which is all the previous version did.
 */
function artworkKey(base: string): string {
  return (LOGO_ALIASES[base] || base).replace(/^\d+(?=[A-Z])/, '').toLowerCase();
}

/** Resolve an artwork key to a shipped logo path, or null when we ship none. */
function resolveLogoSrc(asset: string): string | null {
  if (!SHIPPED_COIN_ICONS.has(asset)) return null;
  // BASE_URL keeps the path correct if the app is ever served from a sub-path;
  // it is '/' for the current build, so this resolves to /crypto-icons/<a>.png.
  const publicBase = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${publicBase.endsWith('/') ? publicBase : `${publicBase}/`}crypto-icons/${asset}.png`;
}

/**
 * Ordered artwork candidates: shipped PNG first, then the server-side icon proxy
 * (src/services/iconProxy.ts), then nothing and the monogram takes over.
 *
 * The proxy is why this component can reach past its own manifest without giving
 * up the properties the manifest was protecting: the browser only ever requests
 * a same-origin `/api/icon/*` URL, so the strict `img-src 'self'` CSP still
 * holds and no per-symbol request reaches a CDN from the user's machine. The
 * server fetches from a closed host allowlist and caches hits and misses.
 *
 * The manifest now covers the top 300 by market cap, so in practice the proxy
 * only serves the long tail below that line. Assets no upstream carries answer
 * 204 and correctly fall through to the monogram, so an unshipped symbol
 * degrades to a themed initial rather than a broken-image box.
 *
 * The numeric multiplier has to go: Bybit lists 1000PEPE-USDT, and the artwork
 * is filed under `pepe`.
 */
function buildLogoCandidates(base: string): string[] {
  const asset = artworkKey(base);
  const local = resolveLogoSrc(asset);
  const candidates = local ? [local] : [];
  // The proxy stays as the LAST candidate rather than the only one. For a
  // shipped symbol it is never requested: the browser only advances to it if
  // the local PNG itself fails to decode, which is the dead-file safety net the
  // index-based `attempt` state was built for. For an unshipped symbol it is
  // the sole network path, which is the intended top-300-and-beyond split.
  if (/^[a-z0-9-]{1,16}$/.test(asset)) candidates.push(`/api/icon/${asset}`);
  return candidates;
}

function BtcGlyph({ color }: { color: string }) {
  return (
    <path
      fill={color}
      d="M15.9 10.66c.22-1.49-.91-2.29-2.46-2.82l.5-2.01-1.23-.31-.49 1.96c-.32-.08-.66-.16-.99-.24l.49-1.97-1.23-.31-.5 2.01c-.27-.06-.53-.12-.78-.19l-1.69-.42-.33 1.32s.91.21.89.22c.5.12.59.45.57.71l-.57 2.29c.03.01.08.02.13.05l-.13-.03-.8 3.21c-.06.15-.22.38-.57.29.01.02-.89-.22-.89-.22l-.61 1.41 1.6.4c.3.07.58.15.87.22l-.51 2.03 1.23.31.5-2.01c.34.09.66.17.98.25l-.5 2 1.23.31.51-2.03c2.1.4 3.68.24 4.34-1.66.54-1.53-.03-2.41-1.13-2.99.8-.18 1.4-.71 1.57-1.79Zm-2.81 3.94c-.38 1.53-2.98.7-3.83.49l.68-2.74c.85.21 3.55.63 3.15 2.25Zm.39-3.96c-.35 1.4-2.51.69-3.21.51l.62-2.48c.7.17 2.96.5 2.59 1.97Z"
    />
  );
}

function EthGlyph({ color }: { color: string }) {
  return (
    <g fill={color}>
      <path d="M12 3.5 7.2 12l4.8 2.85L16.8 12 12 3.5Z" opacity=".65" />
      <path d="M12 3.5 16.8 12 12 14.85V3.5Z" />
      <path d="M12 15.75 7.2 12.9 12 20.5l4.8-7.6-4.8 2.85Z" opacity=".65" />
      <path d="M12 20.5v-4.75l4.8-2.85L12 20.5Z" />
    </g>
  );
}

export function CoinIcon({ symbol, size = 32, className }: CoinIconProps) {
  const base = extractBase(symbol);
  const theme = COIN_THEMES[base] || derivedTheme(base);
  const label = base.slice(0, base.length > 4 ? 1 : 2);
  const candidates = React.useMemo(() => buildLogoCandidates(base), [base]);
  const candidateKey = candidates.join('|');

  // A failed decode must not leave a blank circle, so the themed glyph/initials
  // path stays mounted as the last-resort fallback. An index rather than a
  // boolean, so a 204 from the proxy or a dead local file advances to the next
  // candidate instead of ending the chain. Keyed by the candidate list so
  // switching symbols in a virtualised table re-arms the attempt.
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => { setAttempt(0); }, [candidateKey]);

  const logoSrc = candidates[attempt] ?? null;
  const showLogo = logoSrc != null;

  return (
    <span
      className={`apex-coin-icon${showLogo ? ' has-logo' : ''} ${className ?? ''}`.trim()}
      role="img"
      aria-label={`${base} coin icon`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: '50%',
        // Real artwork sits on a neutral plate so brand colours read true; the
        // tinted plate is only for the initials/glyph fallback.
        background: showLogo ? '#f4f6f8' : theme.bg,
        color: theme.fg,
        fontWeight: 700,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        lineHeight: 1,
        overflow: 'hidden',
      }}
    >
      {showLogo ? (
        <img
          src={logoSrc as string}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          key={logoSrc as string}
          onError={() => setAttempt((current) => current + 1)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : theme.glyph === 'letter' ? (
        label
      ) : (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} aria-hidden="true">
          {theme.glyph === 'btc' && <BtcGlyph color={theme.fg} />}
          {theme.glyph === 'eth' && <EthGlyph color={theme.fg} />}
        </svg>
      )}
    </span>
  );
}
