# Provider Routing Stress Report v1

- Generated: 2026-08-03T10:03:16.851Z
- Verdict: **PASS**
- Seed: 42
- Scenarios: 12
- Checks: 16/16

## Failure-mode table

| Scenario | Failure mode | Ops state | Envelope | Reason | Value null | Fabricated |
|---|---|---|---|---|---|---|
| direct_success | DIRECT_SUCCESS | READY | live | — | no | no |
| timeout | TIMEOUT | UNAVAILABLE | unavailable | timeout_aborted | yes | no |
| geo_blocked_gate | GEO_BLOCKED | GEO_BLOCKED | unavailable | symbol_gate_unavailable | yes | no |
| rate_limited | RATE_LIMITED | RATE_LIMITED | unavailable | rate_limited | yes | no |
| upstream_5xx | UPSTREAM_5XX | UNAVAILABLE | unavailable | bad_gateway | yes | no |
| malformed_response | MALFORMED_RESPONSE | UNAVAILABLE | unavailable | malformed_json | yes | no |
| unsupported_symbol | UNSUPPORTED_SYMBOL | UNSUPPORTED | unavailable | symbol_not_supported_by_binance_usdm | yes | no |
| proxy_unavailable | PROXY_UNAVAILABLE | UNAVAILABLE | unavailable | unscripted_or_proxy_unavailable | yes | no |
| all_routes_unavailable | ALL_ROUTES_UNAVAILABLE | UNAVAILABLE | unavailable | symbol_gate_unavailable | yes | no |
| degraded_lkg | DEGRADED_LKG | DEGRADED | degraded | fresh_failed_lkg | no | no |
| cooldown_active | COOLDOWN_ACTIVE | DEGRADED | degraded | cooldown_active_lkg | no | no |
| recovery_after_cooldown | RECOVERY_AFTER_COOLDOWN | READY | live | — | no | no |

## Safety checks

| Check | Verdict | Ops state | Actual | Expected |
|---|---|---|---|---|
| direct_success_live | PASS | READY | live | live with non-null value |
| timeout_unavailable_null | PASS | UNAVAILABLE | unavailable:true | unavailable with null value |
| geo_blocked_gate_unavailable | PASS | GEO_BLOCKED | unavailable:symbol_gate_unavailable | unavailable (gate geo-blocked) with null value |
| rate_limit_not_live_null | PASS | RATE_LIMITED | unavailable:null | unavailable with null value |
| upstream_5xx_unavailable_null | PASS | UNAVAILABLE | unavailable:null | unavailable with null value |
| malformed_unavailable_null | PASS | UNAVAILABLE | unavailable:null | unavailable with null value (no fabricated payload) |
| unsupported_symbol_no_cooldown | PASS | UNSUPPORTED | symbol_not_supported_by_binance_usdm:false | unavailable + symbol_not_supported + no cooldown |
| proxy_unavailable_null | PASS | UNAVAILABLE | unavailable:null | unavailable with null value |
| all_routes_unavailable_null | PASS | UNAVAILABLE | unavailable:null | unavailable with null value |
| fresh_fail_degrades_to_authentic_lkg | PASS | DEGRADED | degraded:fresh_failed_lkg | degraded with authentic LKG (never reported live) |
| cooldown_serves_lkg_degraded | PASS | DEGRADED | degraded:cooldown_active_lkg | degraded cooldown_active_lkg |
| recovery_after_cooldown_live | PASS | READY | true:live | cooldown cleared + live |
| no_fabricated_unavailable_values | PASS | UNAVAILABLE | 0 | 0 fabricated unavailable payloads |
| cooldown_scoped_per_symbol | PASS | DEGRADED | true:false | BTC cooling, ETH free |
| deterministic_seed_recorded | PASS | READY | 42 | finite seed (default 42) |
| scenario_contract_complete | PASS | READY | 12 | 12 fully classified scenarios |

## Safety boundary

Deterministic synthetic provider-routing evidence only. Does not train shadow ML,
create Decision Memory exports, enable live trading, or alter scanner/execution
behavior. Unavailable data remains unavailable — never a fabricated neutral.
