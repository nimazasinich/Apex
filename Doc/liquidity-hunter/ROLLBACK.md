# Liquidity Hunter Foundation Rollback

## Fast rollback

Leave all liquidity-hunter feature flags unset or set them to `false`. `APEX_LIQUIDITY_HUNTER_SHADOW_ONLY` remains `true`. With the flags disabled, existing APEX strategy, scanner, backtest, manual, paper, and testnet behavior remains unchanged.

## Code rollback

1. Remove the new files under `src/contracts/realtime/`, `src/services/realtime/`, `src/services/liquidityHunter/`, and `src/services/replay/eventReplayReader.ts`.
2. Revert only the additive liquidity-hunter hunks in `server.ts`, `src/types.ts`, `src/services/operationsStatus.ts`, `.env.example`, `openapi/apex-api.v1.yaml`, and `package.json`.
3. Remove the liquidity-hunter QA scripts, tests, documentation, and baseline artifacts.
4. Re-run the preserved feature, strategy, route, and replay gates before release.

No database migration, strategy-registry mutation, execution-intent migration, or irreversible threshold change is introduced by this package.
