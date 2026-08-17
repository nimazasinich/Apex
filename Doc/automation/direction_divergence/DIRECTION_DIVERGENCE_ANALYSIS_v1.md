# APEX Direction-Divergence Outcome Analysis v1

Generated: 2026-08-03T10:03:17.408Z

## Gate Verdict

**INSUFFICIENT_DATA — category-level conclusions remain descriptive only.**

Minimum sample-size gate:
- Required resolved accepted rows: >= 300
- Required minority class rows (min WIN, LOSS): >= 30
- Actual resolved accepted rows: 0
- Actual minority class rows: 0

## Source

- Source file: not found
- Loader note: No Decision Memory export was found. Put a JSON export at Doc/automation/ml_dataset/decision_memory_export_v1.json, temp/decision-memory-v1.json, or set APEX_DECISION_MEMORY_EXPORT.
- Node cannot read browser IndexedDB directly. Export Decision Memory from the UI and save the JSON at `Doc/automation/ml_dataset/decision_memory_export_v1.json`, or set `APEX_DECISION_MEMORY_EXPORT`.

## Row Counts

| Stage | Rows |
|---|---:|
| Total rows loaded | 0 |
| Rows with valid direction-divergence classification | 0 |
| Resolved accepted rows used for analysis | 0 |
| Excluded rows | 0 |

## Excluded Rows

- none

## Outcome Totals

| Outcome | Count |
|---|---:|
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |

## Category Summaries

### WITH_TREND

| Metric | Value |
|---|---:|
| Sample count | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Win rate | n/a |
| Average PnL | n/a |
| Average alignment score | n/a |
| Average trend strength | n/a |
| Average timeframe agreement | n/a |

### RANGE

| Metric | Value |
|---|---:|
| Sample count | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Win rate | n/a |
| Average PnL | n/a |
| Average alignment score | n/a |
| Average trend strength | n/a |
| Average timeframe agreement | n/a |

### COUNTER_TREND

| Metric | Value |
|---|---:|
| Sample count | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Win rate | n/a |
| Average PnL | n/a |
| Average alignment score | n/a |
| Average trend strength | n/a |
| Average timeframe agreement | n/a |


## Chronological Splits

Random splitting is not used. Rows are sorted by `timestamp`: first 70% train, next 15% validation, most recent 15% test.

### train

| Metric | Value |
|---|---:|
| Rows | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Start | n/a |
| End | n/a |
| WITH_TREND | 0 |
| RANGE | 0 |
| COUNTER_TREND | 0 |

### validation

| Metric | Value |
|---|---:|
| Rows | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Start | n/a |
| End | n/a |
| WITH_TREND | 0 |
| RANGE | 0 |
| COUNTER_TREND | 0 |

### test

| Metric | Value |
|---|---:|
| Rows | 0 |
| WIN | 0 |
| LOSS | 0 |
| BREAKEVEN | 0 |
| Start | n/a |
| End | n/a |
| WITH_TREND | 0 |
| RANGE | 0 |
| COUNTER_TREND | 0 |


## Data Completeness

| Metric | Value |
|---|---:|
| Average | n/a |
| Minimum | n/a |
| Maximum | n/a |

## Known Limitations

- Direction-divergence analysis is shadow-only and does not change scanner gates, lifecycle behavior, or execution.
- qStructDirectional is a scanner-structure proxy, not an independently validated multi-timeframe trend indicator.
- Classification is direction-aware: negative structure aligns with SHORT and positive structure aligns with LONG.
- Rejected candidates and unresolved outcomes are excluded from realized outcome conclusions.
- Chronological splits are deterministic; random splitting is not used.
- Category thresholds are fixed audit heuristics and must not be treated as fitted decision boundaries.
