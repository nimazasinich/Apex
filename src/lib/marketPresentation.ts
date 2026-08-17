const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'BTC', 'ETH'];

const SYMBOL_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  BTCB: 'BTC',
  BCHABC: 'BCH',
  BCHSV: 'BSV',
  BCC: 'BCH',
  LUNA2: 'LUNA',
  USTC: 'UST',
  BEAMX: 'BEAM',
  WBTC: 'BTC',
  XNO: 'NANO',
  MIOTA: 'IOTA',
  BETH: 'ETH',
  RUNECOIN: 'RUNE',
  POL: 'MATIC',
  RNDR: 'RENDER',
  PEPE1000: 'PEPE',
  SHIB1000: 'SHIB',
  FLOKI1000: 'FLOKI',
  BONK1000: 'BONK',
};

const ICON_ALIASES: Record<string, string[]> = {
  BTC: ['btc', 'bitcoin'],
  ETH: ['eth', 'ethereum'],
  SOL: ['sol', 'solana'],
  BNB: ['bnb', 'binancecoin'],
  XRP: ['xrp', 'ripple'],
  ADA: ['ada', 'cardano'],
  AVAX: ['avax', 'avalanche'],
  DOGE: ['doge', 'dogecoin'],
  DOT: ['dot', 'polkadot'],
  LINK: ['link', 'chainlink'],
  MATIC: ['matic', 'polygon', 'pol'],
  POL: ['matic', 'pol', 'polygon'],
  SHIB: ['shib', 'shiba-inu'],
  TON: ['ton', 'the-open-network'],
  TRX: ['trx', 'tron'],
  BCH: ['bch', 'bitcoin-cash'],
  BSV: ['bsv', 'bitcoin-sv'],
  XLM: ['xlm', 'stellar'],
  UNI: ['uni', 'uniswap'],
  SUI: ['sui'],
  APT: ['apt', 'aptos'],
  PEPE: ['pepe'],
  ETC: ['etc', 'ethereum-classic'],
  LTC: ['ltc', 'litecoin'],
  ATOM: ['atom', 'cosmos'],
  RENDER: ['render', 'rndr'],
  FET: ['fetch-ai', 'fet'],
  TIA: ['celestia', 'tia'],
  WIF: ['dogwifhat', 'wif'],
  TWT: ['trust-wallet-token', 'twt'],
  SAND: ['the-sandbox', 'sand'],
  GRT: ['the-graph', 'grt'],
  IOTX: ['iotex', 'iotx'],
  XAUT: ['tether-gold', 'xaut'],
  FLOKI: ['floki'],
  BONK: ['bonk'],
};

const LOCAL_ICON_ASSETS = new Set([
  'aave', 'ada', 'algo', 'atom', 'avax', 'bch', 'bnb', 'bsv', 'btc', 'dash',
  'doge', 'dot', 'eos', 'etc', 'eth', 'link', 'ltc', 'matic', 'sol', 'trx',
  'uni', 'xlm', 'xmr', 'xrp', 'xtz',
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

export function baseAssetFromMarket(symbol: string): string {
  const upper = String(symbol || '').toUpperCase().trim();
  const pairToken = upper.split(/[-_/:]/)[0] || upper;
  const strippedContract = pairToken.replace(/PERP$/, '').replace(/USDTM$/, 'USDT');
  const pairBase = QUOTE_ASSETS.reduce(
    (value, quote) => value.endsWith(quote) && value.length > quote.length ? value.slice(0, -quote.length) : value,
    strippedContract,
  );
  const withoutContractMultiplier = pairBase.replace(/^\d+(?=[A-Z])/, '');
  return SYMBOL_ALIASES[pairBase] || SYMBOL_ALIASES[withoutContractMultiplier] || withoutContractMultiplier || 'COIN';
}

function iconNameVariants(symbol: string): string[] {
  const base = baseAssetFromMarket(symbol).toUpperCase();
  const manual = ICON_ALIASES[base] || [base.toLowerCase()];
  return unique(manual.map((name) => name.toLowerCase()));
}

function sourcesForName(name: string): string[] {
  const local = LOCAL_ICON_ASSETS.has(name)
    ? [`/crypto-icons/${name}.png`]
    : [];
  return [
    ...local,
    // Same-origin proxy — server fetches from an allowlisted CDN and serves the
    // bytes here, keeping the strict `img-src 'self'` CSP. See src/services/iconProxy.ts.
    `/api/icon/${name}`,
  ];
}

export function coinIconSources(symbol: string): string[] {
  return unique(iconNameVariants(symbol).flatMap(sourcesForName));
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1_000 ? 2 : absolute >= 1 ? 4 : absolute >= 0.01 ? 6 : 8;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: absolute >= 1 ? Math.min(2, maximumFractionDigits) : 0,
    maximumFractionDigits,
  });
}

export function formatCompactNumber(value: number | null | undefined, currency = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const formatted = Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatPercent(value: number | null | undefined, digits = 2, signed = true): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const prefix = signed && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}%`;
}

export function parseFormattedNumber(value: string): number | null {
  const compact = value
    .trim()
    .replace(/[\s_']/g, '')
    .replace(/[^0-9+\-.,]/g, '')
    .replace(/(?!^)[+-]/g, '');
  if (!compact || compact === '-' || compact === '+') return null;

  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  const localeDecimal = Intl.NumberFormat().formatToParts(1.1).find((part) => part.type === 'decimal')?.value || '.';
  let decimalSeparator = '';

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSeparator = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ',';
    const separatorIndex = Math.max(lastDot, lastComma);
    const fractionalDigits = compact.length - separatorIndex - 1;
    const occurrenceCount = compact.split(separator).length - 1;
    const looksLikeGroupedThousands = occurrenceCount > 1 && compact.split(separator).slice(1).every((group) => group.length === 3);
    decimalSeparator = looksLikeGroupedThousands
      ? ''
      : separator === localeDecimal || fractionalDigits !== 3
        ? separator
        : '';
  }

  let normalized = compact;
  if (decimalSeparator) {
    const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
    normalized = normalized.replaceAll(groupingSeparator, '');
    const decimalIndex = normalized.lastIndexOf(decimalSeparator);
    normalized = `${normalized.slice(0, decimalIndex).replaceAll(decimalSeparator, '')}.${normalized.slice(decimalIndex + 1)}`;
  } else {
    normalized = normalized.replace(/[.,]/g, '');
  }

  if (!normalized || normalized === '-' || normalized === '+' || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatInputNumber(value: number | null | undefined, maximumFractionDigits = 8): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toLocaleString(undefined, {
    useGrouping: true,
    maximumFractionDigits,
  });
}

export function assetHue(symbol: string): number {
  const base = baseAssetFromMarket(symbol);
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) hash = ((hash << 5) - hash + base.charCodeAt(index)) | 0;
  return Math.abs(hash) % 360;
}
