import React from 'react';

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
 * Real logo artwork that ships with the app in `public/crypto-icons/`.
 *
 * This list is an explicit manifest rather than a glob so the mapping is
 * deterministic and reviewable: every entry here MUST exist on disk. Adding a
 * new logo is a two-step change (drop the PNG in, add the base symbol here),
 * which keeps a missing file from silently degrading to initials.
 *
 * Deliberately local: no remote CDN URLs, so icons cannot break offline, on a
 * locked-down network, or when a third-party host rotates its paths.
 */
const LOCAL_LOGO_ASSETS: Record<string, string> = {
  AAVE: 'aave',
  ADA: 'ada',
  ALGO: 'algo',
  ATOM: 'atom',
  AVAX: 'avax',
  BCH: 'bch',
  BNB: 'bnb',
  BSV: 'bsv',
  BTC: 'btc',
  DASH: 'dash',
  DOGE: 'doge',
  DOT: 'dot',
  EOS: 'eos',
  ETC: 'etc',
  ETH: 'eth',
  LINK: 'link',
  LTC: 'ltc',
  MATIC: 'matic',
  SOL: 'sol',
  TRX: 'trx',
  UNI: 'uni',
  XLM: 'xlm',
  XMR: 'xmr',
  XRP: 'xrp',
  XTZ: 'xtz',
};

/**
 * Tickers that denote the same underlying asset as an entry above. Wrapped and
 * renamed tokens are the common case on perpetual venues, and without these the
 * user sees initials for an asset whose logo we actually ship.
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

/** Resolve a base symbol to a local logo path, or null when we ship no artwork. */
function resolveLogoSrc(base: string): string | null {
  const asset = LOCAL_LOGO_ASSETS[base] || LOCAL_LOGO_ASSETS[LOGO_ALIASES[base] || ''];
  if (!asset) return null;
  // BASE_URL keeps the path correct if the app is ever served from a sub-path;
  // it is '/' for the current build, so this resolves to /crypto-icons/<a>.png.
  const publicBase = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${publicBase.endsWith('/') ? publicBase : `${publicBase}/`}crypto-icons/${asset}.png`;
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
  const theme = COIN_THEMES[base] || FALLBACK_THEME;
  const label = base.slice(0, base.length > 4 ? 1 : 2);
  const logoSrc = resolveLogoSrc(base);

  // A failed decode must not leave a blank circle, so the themed glyph/initials
  // path stays mounted as the last-resort fallback. Keyed by src so switching
  // symbols in a virtualised table re-arms the attempt.
  const [logoFailed, setLogoFailed] = React.useState(false);
  React.useEffect(() => { setLogoFailed(false); }, [logoSrc]);

  const showLogo = Boolean(logoSrc) && !logoFailed;

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
          onError={() => setLogoFailed(true)}
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
