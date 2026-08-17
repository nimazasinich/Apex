import React from 'react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { BacktestResult } from '../types';

export default function BacktestChart({ result }: { result: BacktestResult | null }) {
  if (!result || !result.equityCurve?.length) return <div className="apex-bt-chart-empty">No chart data</div>;
  const equityData = result.equityCurve.map((entry, index) => {
    const ts = entry.timestamp ?? result.timeline?.[index]?.timestamp ?? 0;
    const date = ts ? new Date(ts) : null;
    const dateLabel = date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : `Step ${index}`;
    return { step: entry.step ?? index, equity: entry.equity, dateLabel };
  });
  return (
    <div className="apex-bt-chart-area">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="apexBtEquityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c6f5d6" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
          <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 11, fill: 'var(--bt-muted)' }} />
          <YAxis axisLine={false} tickLine={false} width={46} domain={["auto", "auto"]} tickFormatter={(value) => Number(value).toFixed(0)} tick={{ fontSize: 11, fill: 'var(--bt-muted)' }} />
          <ReferenceLine y={100} stroke="var(--bt-border-strong)" strokeDasharray="4 4" />
          <Tooltip formatter={(v: any) => [Number(v).toFixed(2), 'Equity']} />
          <Area type="monotone" dataKey="equity" stroke="var(--bt-green)" strokeWidth={2.5} fill="url(#apexBtEquityFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
