# APEX APP_INDEX — Agent Code Cartography

`APP_INDEX/` is the repository-wide map. It complements the canonical Function Atlas rather than replacing it.

**Core rule:** an import edge is not proof of liveness. A file is production-live only when there is a transitive authoritative path from an explicit production root (`server.ts`, `index.html`, or `src/main.tsx`). If dead file A imports dead file B, both remain in a dead island. Resolver uncertainty (dynamic expressions or fuzzy candidates) is preserved instead of silently dropped.

## Canonical commands

```bash
npm run index:app
npm run index:app:check
npm run index:app:file -- src/services/providerHealth.ts
npm run index:app:folder -- src/services
npm run index:app:dead
npm run index:app:layer -- "integration|service"
npm run index:app:symbol -- "ProviderHealth"
npm run index:app:history -- src/services/providerHealth.ts
npm run index:app:why -- src/services/providerHealth.ts
npm run index:app:resolution
npm run index:app:unresolved
npm run index:app:unused-exports
npm run index:app:layers
npm run index:app:git-history -- src/services/providerHealth.ts
npm run qa:app-index-lineage
```

## Files

- `APP_MAP.json` — current machine-readable repository map.
- `APP_MAP.md` — current human summary.
- `TREE.md` — complete folder/subfolder/file hierarchy.
- `APP_GRAPH.dot` — full file dependency graph for Graphviz.
- `LAYER_GRAPH.mmd` — compact Mermaid architecture-layer dependency graph.
- `app-index.sqlite` — persistent snapshots, file identities, path history, moves, dependencies and symbol history.
- `layers.json` — ordered architecture-layer classification rules.

## What every file record tells an agent

- exact repository path/folder/layer;
- SHA-256, size, line count (LOC), file type and parse-diagnostic state;
- direct internal dependencies with edge kind, source line, imported symbol names, type-only status and resolution provenance;
- external packages, unresolved imports, probable/fuzzy candidates, alias/glob resolution provenance and case-mismatch diagnostics;
- reverse dependencies (`fanIn`) and outgoing dependencies (`fanOut`);
- production/possible-production/test/source-contract reachability;
- shortest production/test proof path from a valid root;
- `dead-island` / `orphan` status independent of raw import counts;
- runtime SCC/cycle membership;
- Function Atlas symbols/functions/classes plus AST top-level declarations and module-export facts;
- advisory unused-export candidates; namespace/dynamic/require consumers suppress claims, and candidates are never deletion authority;
- history available in SQLite.

## History semantics

The database assigns a stable internal `file_id` while a file stays at the same path. An exact content-hash move preserves that identity and records a `moves` row with confidence `1.0`. Probable move detection combines persisted normalized-line similarity with Function Atlas symbol overlap; it is labeled probable and is never promoted to certainty. When the project is in Git, Git history remains the authoritative source for historical rename tracing (`git log --follow`, `git diff -M`). The canonical synthetic regression `npm run qa:app-index-lineage` exercises fresh add, exact-hash move, rename+edit probable lineage, same-path modification, unrelated add/delete, and ambiguous-candidate rejection against the same helper used by the production indexer.

## Methodology

The design borrows the separation of symbols/occurrences/relationships from SCIP, root-reachability/dead-wood and cycle concepts used by dependency graph tooling, and conservative rename semantics inspired by Git. The APEX-specific safety addition is that no raw import count can upgrade an unreachable component to live status.

Function Atlas outputs are mapped as files but excluded from the SQLite snapshot trigger because `npm run index:app` refreshes them first and their generated timestamp would otherwise create a false history snapshot. Source-file hashes still trigger the snapshot, so real code changes are preserved.

Working-copy agent state such as `.serena/` and `.agent-index/` is outside the canonical application map. These directories may change between machines or conversations and are intentionally excluded so a clean source archive preserves a fresh, reproducible `APP_INDEX`.

## Resolver safety

`resolver.mjs` reads TypeScript paths, statically-readable Vite aliases and local package imports, expands Vite glob/dynamic-template imports, and records case-insensitive fallback explicitly. Fuzzy basename resolution is probable-only and cannot prove liveness. Any production-reachable dynamic import that cannot be enumerated degrades `deadClassificationTrusted`, so agents must not delete code on the basis of an incomplete graph.
