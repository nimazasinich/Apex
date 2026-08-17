import React, { useEffect, useMemo, useState } from 'react';

const SYMBOL_ALIASES: Record<string, string> = {
  XBT: 'btc',
  BTCB: 'btc',
  BCHABC: 'bch',
  BCHSV: 'bsv',
  BCC: 'bch',
  LUNA2: 'luna',
  LUNC: 'lunc',
  POL: 'matic',
  MATIC: 'matic',
  RNDR: 'render',
  RENDER: 'render',
  XNO: 'nano',
  DOGS: 'dogs',
  WIF: 'dogwifhat',
  PEPE1000: 'pepe',
  '1000PEPE': 'pepe',
  SHIB1000: 'shib',
  '1000SHIB': 'shib',
  FLOKI1000: 'floki',
  '1000FLOKI': 'floki',
  BONK1000: 'bonk',
  '1000BONK': 'bonk',
  XAUT: 'tether-gold',
  WBTC: 'btc',
  BSV: 'bsv',
  IOTX: 'iotex',
  BABYDOGE: 'babydoge',
  OMNI: 'omni',
  BOME: 'bome',
  AXL: 'axl',
  FET: 'fetch-ai',
  TIA: 'celestia',
  TWT: 'trust-wallet-token',
  SAND: 'the-sandbox',
  GRT: 'the-graph',
};

const BUNDLED_ASSETS = new Set([
  'ada', 'avax', 'bnb', 'btc', 'doge', 'dot', 'eth', 'link', 'matic', 'sol', 'xrp',
]);

const SOURCE_CANDIDATES = [
  (asset: string) => `/crypto-icons/${asset}.svg`,
  (asset: string) => `/crypto-icons/${asset}.png`,
  // Same-origin proxy: the server fetches the icon from an allowlisted CDN and
  // serves the bytes here, so the browser never hits a third-party host and the
  // strict `img-src 'self'` CSP holds. See src/services/iconProxy.ts.
  (asset: string) => `/api/icon/${asset}`,
];

function normalizeAsset(asset: string) {
  return asset.trim().toLowerCase().replace(/\s+/g, '-');
}

function extractAssetSymbol(symbol: string): string {
  const pair = symbol.toUpperCase().trim().split(/[-_/:]/)[0] || symbol;
  const withoutMultiplier = pair.replace(/^\d+(?=[A-Z])/, '').replace(/PERP$/, '');
  const mapped = SYMBOL_ALIASES[pair] || SYMBOL_ALIASES[withoutMultiplier] || withoutMultiplier.toLowerCase();
  return normalizeAsset(mapped);
}

function iconSources(asset: string): string[] {
  const sources = SOURCE_CANDIDATES.map((builder) => builder(asset));
  if (BUNDLED_ASSETS.has(asset)) {
    return [`/crypto-icons/${asset}.png`, ...sources.filter((src) => src !== `/crypto-icons/${asset}.png`)];
  }
  return sources;
}

export interface CryptoIconProps {
  symbol: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  decorative?: boolean;
}

export function CryptoIcon({ symbol, size = 'md', className = '', decorative = false }: CryptoIconProps) {
  const asset = useMemo(() => extractAssetSymbol(symbol), [symbol]);
  const sources = useMemo(() => iconSources(asset), [asset]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [asset]);

  const onError = () => {
    if (sourceIndex < sources.length - 1) setSourceIndex((current) => current + 1);
    else setFailed(true);
  };

  return (
    <span
      className={`apex-crypto-icon ${size} ${failed ? 'fallback' : ''} ${className}`.trim()}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${asset.toUpperCase()} cryptocurrency icon`}
      data-asset={asset}
    >
      {!failed ? (
        <img
          src={sources[sourceIndex]}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={onError}
        />
      ) : (
        <span>{asset.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
