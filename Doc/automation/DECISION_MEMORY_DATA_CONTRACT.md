# Decision Memory Data Contract

## Why decision memory exists

The scanner must remember both what it accepted and what it rejected. Without rejected candidates, the model only learns from trades it took. That creates survivorship bias.

APEX now stores decision logs so the system can later learn from:

- accepted winners
- accepted losses
- rejected setups that would have won
- rejected setups that correctly avoided losses
- rejection reasons by market regime
- settings snapshots at the time of the decision

## Storage layer

The browser storage layer uses:

```text
IndexedDB primary
localStorage fallback
```

Service:

```text
src/services/decisionMemory.ts
```

The decision log store remains browser-local-first so UI and scanner performance
do not depend on an external database. The current server also exposes an
optional, same-origin mirror at `/api/decision-memory`; mirror writes are
batched and failures degrade silently.

## Required fields

```text
id
cycleId
timestamp
isoTime
ticker
direction
decision
reasonCode
reasonText
```

## Optional intelligence fields

```text
confidence
rawScore
qStructDirectional
squeezeRiskScore
evidenceAgreementScore
liquidityQualityScore
microPriceSkewScore
fundingBiasScore
oiChangePercent
atrExpansionScore
scoringBreakdown
gatesSnapshot
configSnapshot
marketSnapshotSummary
```

## Outcome fields

```text
laterOutcome
laterPnl
```

These are critical for learning. They turn the decision log into training data.

## Reason codes

Important rejection codes include:

```text
GATE_OBI_FAILED
GATE_VOLUME_FAILED
GATE_QSTRUCT_FAILED
HIGH_SQUEEZE_RISK
LOW_EVIDENCE_AGREEMENT
LOW_CONFIDENCE
LOWER_RANK_THAN_BEST
SNAPSHOT_UNAVAILABLE
EVALUATION_ERROR
```

## Accepted decisions

Accepted logs should store:

- model confidence
- raw score
- QStruct
- squeeze risk
- evidence agreement
- all scoring factors
- config snapshot
- market snapshot summary

Later, when the watchlist lifecycle resolves the signal, `laterOutcome` and `laterPnl` should be attached to the same log.

## Rejected decisions

Rejected logs are equally important. The engine should store rejected candidates because they teach:

- whether a filter is too strict
- whether a filter prevented losses
- which thresholds are choking the scanner under load
- which reasons dominate in each market regime

## Backend upgrade path

For production multi-device use, mirror IndexedDB records into a backend table:

```sql
signal_decision_logs (
  id text primary key,
  cycle_id text,
  timestamp bigint,
  ticker text,
  direction text,
  decision text,
  reason_code text,
  reason_text text,
  confidence numeric,
  raw_score numeric,
  q_struct_directional numeric,
  squeeze_risk_score numeric,
  evidence_agreement_score numeric,
  liquidity_quality_score numeric,
  micro_price_skew_score numeric,
  scoring_breakdown jsonb,
  gates_snapshot jsonb,
  config_snapshot jsonb,
  market_snapshot_summary jsonb,
  later_outcome text,
  later_pnl numeric
)
```

Backend sync is optional for the current local-first version. When enabled,
rows are persisted in a server-side JSON snapshot and indexed by ticker,
decision, reason code, and outcome. The browser store remains authoritative,
and the initial browser load queues existing rows for migration without
deleting local records.

Operational endpoints:

- `POST /api/decision-memory/batch` with `{ "rows": [...] }`
- `GET /api/decision-memory` with optional `ticker`, `decision`,
  `reasonCode`, `laterOutcome`, `since`, `until`, and `limit` filters
- `GET /api/decision-memory/status`

Set `APEX_DECISION_MEMORY_MIRROR=false` to disable the mirror or
`APEX_DECISION_MEMORY_PATH` to choose its snapshot path.

## Hugging Face Dataset durability backup

HF Space container filesystems are ephemeral, so the optional server-side JSON
mirror can be restored from and periodically backed up to a private Hugging Face
Dataset repository. `src/services/decisionMemoryDatasetSync.ts` uploads one
versioned Decision Memory export payload as `decision-memory-latest.json` and
merges that payload through `DecisionMemoryMirror.putMany()` during server boot.

This is a durability backup/restore layer only. It is not a new authoritative
store and must not compete with browser IndexedDB or replace the existing local
mirror file. Browser IndexedDB remains authoritative, restore only merges
unaltered rows, and a missing, unavailable, or malformed Dataset degrades
without blocking the scanner, mirror writes, or request handling. Scripts under
`scripts/` must not read the HF Dataset as their primary Decision Memory source.

Configuration is server-only: `HF_TOKEN`, `HF_DECISION_MEMORY_REPO`, and
`HF_DECISION_MEMORY_SYNC_INTERVAL_MS` (default 600000 ms, minimum 60000 ms).
The token must be stored as a Space secret and must never be sent to the browser
or written to logs.
