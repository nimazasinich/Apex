# APEX account modes

APEX separates the account/execution environment from the market-data environment.

| Mode | Wallet, portfolio, PnL | Order destination | Market, news, sentiment, scanner |
| --- | --- | --- | --- |
| Demo | Server-side virtual ledger | Never sent to KuCoin | Real provider data |
| Live | Verified KuCoin Futures account | KuCoin Futures after preview and confirmation | Real provider data |

## State rules

- Demo is the safe default and requires no exchange credentials.
- Live cannot be selected until a signed KuCoin private request succeeds.
- Switching to Demo keeps an unexpired verified Live session on standby, so the user can switch back without re-entering credentials.
- Disconnecting removes credentials from server memory, clears the opaque Live-session cookie, disables Live, and returns the workspace to Demo.
- An expired or missing Live session never falls through to Demo during an order request. The server returns `exchange_not_connected` instead.
- API Secret and Passphrase are never returned to the browser or stored in LocalStorage.

## Account API

- `GET /api/account/connection` — active mode and capability state.
- `POST /api/account/mode` — select `demo` or `live`; Live requires a verified session.
- `POST /api/account/connect` — verify credentials and activate Live.
- `DELETE /api/account/connection` — disconnect Live and return to Demo.
- `POST /api/account/demo/reset` — reset the virtual wallet, positions, orders and history.
- `GET /api/account/portfolio` — snapshot for the active mode.
- `POST /api/account/orders/preview` — validate against current contract rules, market price, margin and server ceilings.
- `POST /api/account/orders` — execute the exact unexpired preview in the active mode.
- `POST /api/account/orders/:id/cancel` — cancel an active-mode order.

All mutating requests require the existing APEX CSRF/operator-token checks.
