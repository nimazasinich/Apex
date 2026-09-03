# APEX Research Agent

Mechanical research orchestration for APEX with a hard trust boundary between
repeatable **development-only** experimentation and the **one-shot sealed
holdout**.

## Trust model

| Tool | Allowed | Not allowed |
|---|---|---|
| `runQueuedStudies.mts` | Run reviewed `scripts/research/*.mts` studies on their default development path; retry/time out; capture logs + hashes | Passing `--evaluate-sealed`, approving candidates, changing promotion ledger |
| `summarizeRuns.mts` | Read-only aggregation of run evidence, ledger state and holdout history | Promotion decisions or writes |
| `flagRunRisks.mts` | Read-only heuristic warnings | Promotion decisions or writes |
| `scaffoldStudy.mts` / `suggestHypotheses.mts` | Create **draft** study scaffolds/queue entries | Queueing/running/promoting them automatically |
| `openHoldout.mts` | Open the sealed holdout once, for exact reviewed code | Non-interactive use, force/reopen, arbitrary scripts, code changed after approval |

`study-queue.json` is empty by default. Installing/merging this agent never starts
research and never queues a candidate by itself.

## Development queue

Add a reviewed entry manually:

```json
{
  "id": "candidate-anchored-reversal",
  "script": "scripts/research/runAnchoredReversalStudy.mts",
  "hypothesis": "Anchored cross-sectional reversal after large dislocations",
  "status": "queued"
}
```

Candidate ids are restricted to lowercase letters/digits/hyphens. Study paths
must remain under `scripts/research/` and end in `.mts`; traversal/absolute paths
are blocked.

Run:

```powershell
npm run research:queue
npm run research:queue -- --only candidate-anchored-reversal
npm run research:queue -- --concurrency 2 --timeout 1800 --retries 1
npm run research:queue -- --dry-run
```

The runner resolves the `tsx` CLI from the project’s own `node_modules/tsx/package.json` and executes it with the current Node binary. If local dependencies are absent, it fails immediately; it never invokes `npx` and never falls back to network package acquisition. Each attempt records the exact study SHA-256 in
`run-records/`, plus stdout/stderr in `logs/`. A process failure marks the queue
entry `failed`, not `ran`; dependent studies therefore do not unlock after a
crash.

A successful process exit is **not** a strategy PASS. It only proves that the
development study completed. Read the study's own report/evidence and judge the
statistics yourself.

## Review helpers

```powershell
npm run research:summary
npm run research:summary -- --id candidate-anchored-reversal
npm run research:risks
```

These are display/heuristic tools only. They do not write approvals or open the
holdout.

## Promotion ledger: bind approval to exact code

Before a holdout open, `promotion-ledger.json` must contain exactly one entry for
the candidate with the SHA-256 from the **successful development run of the
exact same study file**:

```json
{
  "id": "candidate-anchored-reversal",
  "ready": true,
  "reason": "Reviewed walk-forward evidence; repository gate and robustness checks passed; no unresolved leakage/multiple-testing concerns",
  "approvedBy": "human-reviewer",
  "approvedAt": "2026-08-29",
  "approvedStudySha256": "<64-hex SHA copied from run-records or research:summary>"
}
```

`openHoldout.mts` independently recomputes the current file hash and requires it
to match both the ledger and a successful development run record. Editing the
study after approval invalidates the approval automatically.

## One-shot sealed holdout

```powershell
npm run research:open-holdout -- --id candidate-anchored-reversal
```

The opener requires a real interactive TTY and the exact phrase:

```text
OPEN HOLDOUT <candidate-id> <first-12-chars-of-study-sha256>
```

After all code/evidence/tooling preflight checks pass and after the exact human confirmation, it appends an `OPENING` record to
`holdout-open-history.json`. That means a crash, terminal close, or failed child
still consumes the one-shot attempt in the audit trail. On completion a second
`COMPLETED` record is appended.

There is deliberately **no** `--yes`, `--force`, or reopen path. A prior holdout
open blocks by candidate id **and** by exact study hash, so renaming the same code
to a new candidate cannot reset the seal.

The target study must explicitly implement:

```ts
const evaluateSealed = process.argv.includes('--evaluate-sealed');
```

If it does not, the opener refuses to run it rather than recording a fake
"holdout open" against a script that ignores the flag.

## Scaffolding

```powershell
npm run research:scaffold -- --id candidate-new-idea --name NewIdea --hypothesis "..."
npm run research:suggest
```

Generated queue entries are `draft`, never `queued`. The template contains no
fabricated loader/data implementation and deliberately throws until its
`runStudy()` body is replaced with a real APEX research harness. Its default
repository gate uses net > 0, PF > 1, maxDD <= 13%, and at least 30 trades; study-
specific robustness/cost-stress requirements can and should be stricter.

## Files

```text
scripts/research-agent/
  README.md
  runQueuedStudies.mts
  summarizeRuns.mts
  flagRunRisks.mts
  scaffoldStudy.mts
  suggestHypotheses.mts
  openHoldout.mts
  study-queue.json
  promotion-ledger.json
  run-history.json
  holdout-open-history.json
  lib/
    researchAgentData.mts
    researchAgentSafety.mts
    studyTemplate.mts
  logs/
  run-records/
```


### Compatibility aliases

The canonical commands are `research:summary`, `research:risks`, and `research:open-holdout`. The historical aliases `research:summarize`, `research:flag-risks`, and `research:holdout` are retained and point to the exact same scripts so existing operator workflows do not break during the merge.
