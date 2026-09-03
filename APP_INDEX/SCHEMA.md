# APP_INDEX schema

## Current map (`APP_MAP.json`)

Schema version 3 keeps resolver provenance and adds AST-level declaration/export/import-name evidence.

Each file record includes:

- path/folder/layer/hash/size/LOC and parse-diagnostic state;
- Function Atlas symbols plus `astDeclarations` and `moduleExports`;
- `exportUsage` with advisory `unusedCandidates` and wildcard-consumer suppression;
- authoritative internal dependencies (`dependencies.internal`) including `importedNames` and `isTypeOnly`;
- probable non-authoritative candidates (`dependencies.probableInternal`);
- external dependencies;
- unresolved dependency evidence with reason/candidates;
- authoritative and probable reverse dependencies;
- production, possible-production, test/tool and source-contract reachability proofs;
- dead-island and SCC/cycle identity.

Each authoritative edge can include `resolution`, `confidence`, `caseMismatch`, `requestedPath`, and edge-specific metadata. Fuzzy/probable edges never count as hard liveness proof.

Top-level `resolution` describes the discovered tsconfig/Vite/package alias configuration and resolver policy. `summary` separately reports static unresolved references, dynamic unresolved references, probable resolutions, case mismatches, absolute-runtime portability risks, and whether dead-code classification is currently trusted.

## SQLite (`app-index.sqlite`)

`app-index.sqlite` is a portable repository-lineage store. The current graph is optimized for agent lookup in `APP_MAP.json`; historical questions are answered from SQLite.

- `snapshots` — one repository-content snapshot per meaningful root hash, with optional Git commit.
- `files` — stable internal file identity across same-path edits and detected moves.
- `file_versions` — path/hash/size/LOC/parse diagnostics/layer/liveness/symbol count/dead-island/cycle per snapshot; includes persisted normalized-line sketches.
- `dependencies` — versioned dependency edges with kind, specifier, source line, imported symbol names, type-only flag, resolution method, confidence, authoritative flag and metadata.
- `dependency_diagnostics` — unresolved and probable resolution evidence, including candidates and reasons.
- `symbols` — Function Atlas symbol records per file/snapshot.
- `module_exports` — AST-derived module export facts per file/snapshot.
- `changes` — added/modified/deleted/moved/probable-move events.
- `moves` — exact-hash moves (confidence 1.0) and explicitly probable similarity moves.

Move confidence is evidence, not permission to rewrite history. Exact hash identity is authoritative inside the snapshot store. Similarity lineage is explicitly probable and should be cross-checked with Git `--follow` / rename detection when Git history exists.
