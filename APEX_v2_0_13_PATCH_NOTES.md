# APEX v2.0.13 patch

Applied fixes:

- Preserve full trading pair identity (BTCUSDT) when calling HF providers.
- Avoid stripping USDT/USDC suffixes before upstream contract requests.
- Keep provider contracts aligned with Space 2/Space 4 canonical routes.

Remaining deployment action:
- Inject secrets only through server environment/HF Secrets.
- Run provider probes after deployment.
