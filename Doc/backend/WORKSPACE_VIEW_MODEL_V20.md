# Backend Workspace View Model — V20

## Purpose

The visual pages must not guess exchange-specific property names or display fabricated metrics. V20 adds a server-owned normalized contract:

```http
GET /api/account/workspace
```

The endpoint works in both Demo and Live modes. It returns:

```ts
{
  connection: ConnectionState;
  snapshot: AccountSnapshot;
  insights: WorkspaceInsights;
}
```

## Data mapping

| Page | Backend source |
|---|---|
| Watchlist | `/api/market/top-volume`, `/api/market/sentiment`, `/api/market/candidates` |
| Orders | `/api/account/workspace`, cancel via `/api/account/orders/:id/cancel` |
| Positions | `/api/account/workspace` |
| Alerts | Real scanner candidates plus persisted browser rules |
| History | `/api/account/workspace` normalized activity stream |
| Analytics | `/api/account/workspace` account history plus real scanner candidates |
| Settings | `/api/account/connection`, `/api/account/connect`, `/api/account/mode`, `/api/account/demo/reset` |
| Help | `/api/system/health` |

## Normalization rules

`src/services/workspaceInsights.ts` accepts the existing `AccountSnapshot` and normalizes Demo and KuCoin variants into stable entities:

- `WorkspacePosition`
- `WorkspaceOrder`
- `WorkspaceActivity`
- `WorkspaceAnalytics`
- account health and risk summary

The normalizer recognizes field variants such as `unrealisedPNL` / `unrealizedPnl`, `currentQty` / `size`, and `dealSize` / `filledQty`.

## Honest data behavior

- Missing deposits and withdrawals remain unavailable; they are not invented.
- Analytics use returned position history and current positions.
- Empty account history produces explicit empty states.
- Market sparklines use provider points when available. A visual-only trend is used only as a chart placeholder around a verified current ticker value and never replaces the displayed backend price.
- Demo execution continues to use real market quotes and virtual balances.
- Live execution retains preview, explicit confirmation, notional, leverage, margin and credential safeguards.
