const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export interface ParsedDeribitOptionInstrument {
  currency: string;
  expiry: number;
  strike: number;
  optionType: 'CALL' | 'PUT';
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

export function parseDeribitOptionInstrument(instrumentName: string): ParsedDeribitOptionInstrument | null {
  const match = /^([A-Z0-9_]+)-(\d{1,2}[A-Z]{3}\d{2})-(\d+(?:\.\d+)?)-([CP])$/i.exec(String(instrumentName || '').trim());
  if (!match) return null;
  const dateMatch = /^(\d{1,2})([A-Z]{3})(\d{2})$/i.exec(match[2]);
  if (!dateMatch) return null;
  const day = Number(dateMatch[1]);
  const month = MONTHS[dateMatch[2].toUpperCase()];
  const year = Number(`20${dateMatch[3]}`);
  const strike = Number(match[3]);
  if (!Number.isSafeInteger(day) || month === undefined || !Number.isSafeInteger(year) || !Number.isFinite(strike) || strike <= 0) return null;
  // Deribit standard option expiries settle at 08:00 UTC. Keep this explicit
  // because the timestamp is part of the gamma reconstruction provenance.
  const expiry = Date.UTC(year, month, day, 8, 0, 0, 0);
  if (!Number.isFinite(expiry)) return null;
  return {
    currency: match[1].toUpperCase(),
    expiry,
    strike,
    optionType: match[4].toUpperCase() === 'C' ? 'CALL' : 'PUT',
  };
}

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

/**
 * Reconstructs Black-Scholes spot gamma from the IV printed on the trade.
 * Deribit trade IV is expressed in percent. The risk-free rate defaults to 0
 * and is recorded by callers as a proxy assumption. This is materially safer
 * than applying today's ticker gamma to an older trade, but it is still a
 * model-based flow estimate rather than authoritative dealer inventory.
 */
export function blackScholesSpotGammaFromTradeIv(input: {
  spot: number;
  strike: number;
  expiry: number;
  timestamp: number;
  ivPercent: number;
  riskFreeRate?: number;
}): number | null {
  const { spot, strike, expiry, timestamp, ivPercent } = input;
  const rate = input.riskFreeRate ?? 0;
  if (![spot, strike, expiry, timestamp, ivPercent, rate].every(Number.isFinite)) return null;
  if (spot <= 0 || strike <= 0 || ivPercent <= 0 || expiry <= timestamp) return null;
  const sigma = ivPercent / 100;
  const years = (expiry - timestamp) / YEAR_MS;
  if (!(years > 0) || sigma <= 0) return null;
  const denom = sigma * Math.sqrt(years);
  if (!(denom > 0)) return null;
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * sigma * sigma) * years) / denom;
  const gamma = normalPdf(d1) / (spot * denom);
  return Number.isFinite(gamma) && gamma > 0 ? gamma : null;
}
