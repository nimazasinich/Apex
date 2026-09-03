export type ApprovedHfSpace = 'space2' | 'space4';
export type ApprovedHfMethod = 'GET' | 'POST';

const SPACE2_GET_PATHS: RegExp[] = [
  /^\/api\/ohlcv$/,
  /^\/api\/klines$/,
  /^\/api\/history$/,
  /^\/api\/crypto\/history\/[A-Za-z0-9_-]+$/,
  /^\/api\/new-sources\/status$/,
  /^\/api\/apex\/news$/,
  /^\/api\/resources\/news\/latest$/,
  /^\/api\/news\/latest$/,
  /^\/api\/sentiment\/global$/,
  /^\/api\/fear-greed$/,
  /^\/api\/apex\/whale-flow$/,
  /^\/api\/service\/whales$/,
  /^\/api\/service\/rate$/,
  /^\/api\/market$/,
  /^\/api\/coverage$/,
  /^\/api\/trading\/backtest\/historical\/[A-Za-z0-9_-]+$/,
  /^\/api\/defi\/protocols$/,
  /^\/api\/defi\/yields$/,
];

const SPACE2_POST_PATHS: RegExp[] = [
  /^\/api\/sentiment$/,
];

const SPACE4_GET_PATHS: RegExp[] = [
  /^\/api\/apex\/funding\/[A-Za-z0-9_-]+$/,
  /^\/api\/apex\/open-interest\/[A-Za-z0-9_-]+$/,
  /^\/api\/apex\/open-interest-archive\/[A-Za-z0-9_-]+$/,
  /^\/api\/apex\/whale-flow$/,
  /^\/api\/health$/,
  /^\/api\/apex\/news$/,
  /^\/api\/news\/latest$/,
  /^\/api\/sentiment\/global$/,
  /^\/api\/crypto\/whales\/transactions$/,
  /^\/api\/whales\/transactions$/,
  /^\/api\/short-hunter\/(?:orderbook|funding|open-interest|market|snapshot|ohlcv)\/[A-Za-z0-9_-]+$/,
];

function pathnameOnly(path: string): string | null {
  try {
    return new URL(path, 'https://apex.invalid').pathname;
  } catch {
    return null;
  }
}

/**
 * Strict executable-contract gate for owner-managed HF gateways.
 * A route being reachable is not enough to make it trusted for APEX; it must be
 * explicitly listed here after its schema, timestamps, units, and provenance
 * semantics have been verified.
 */
export function isApprovedHfSpaceContract(
  space: ApprovedHfSpace,
  method: ApprovedHfMethod,
  path: string,
): boolean {
  const pathname = pathnameOnly(path);
  if (!pathname) return false;

  const patterns = space === 'space2'
    ? (method === 'GET' ? SPACE2_GET_PATHS : SPACE2_POST_PATHS)
    : (method === 'GET' ? SPACE4_GET_PATHS : []);

  return patterns.some((pattern) => pattern.test(pathname));
}
