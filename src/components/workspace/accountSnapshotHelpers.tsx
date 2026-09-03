import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { AccountSnapshot } from '../../services/accountClient';

export function numberFrom(record: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const raw = record[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function stringFrom(record: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!record) return '—';
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return '—';
}

export function normalizeSymbol(symbol: string): string {
  return symbol.replace('XBTUSDTM', 'BTC-USDT').replace(/USDTM$/, '-USDT');
}

export function rows(snapshot: AccountSnapshot | null, key: keyof AccountSnapshot): Array<Record<string, unknown>> {
  const value = snapshot?.[key];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

export function HonestEmpty({ label }: { label: string }) {
  return <div className="apex-honest-empty"><CheckCircle2 size={18} /><span>{label}</span></div>;
}
