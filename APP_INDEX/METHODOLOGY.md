# APP_INDEX Methodology Notes

APEX cartography treats dependency discovery and liveness as two separate questions:

1. **Can this reference be resolved to a repository file?**
2. **Is that file transitively reachable from an authorized root?**

An import edge alone is never proof of liveness. Dead files may import one another and remain a dead island.

## Resolver methodology

The canonical resolver is `scripts/utilities/app-index/resolver.mjs`. Resolution is configuration-aware and intentionally records provenance.

Authoritative resolution sources, in order of applicable specificity:

- relative and repository-root references;
- Vite `resolve.alias` entries that can be statically interpreted;
- TypeScript `compilerOptions.paths` (including wildcard mappings and fallback targets);
- `package.json#imports` local mappings;
- explicit TypeScript `baseUrl` when configured;
- TypeScript-style source extension substitution (`.js` -> `.ts`/`.tsx`/`.mts`/etc. where appropriate);
- case-insensitive filesystem fallback, with `caseMismatch=true` recorded as a portability defect;
- Vite `import.meta.glob(...)` literal expansion, including negative patterns and literal `base`/`caseSensitive` options;
- Vite-compatible dynamic-import template enumeration such as `import(`./plugins/${name}.ts`)`.

### Fuzzy fallback is evidence, not truth

A unique high-confidence basename/path similarity match may be emitted as `fuzzy-probable`. It is **not** inserted into the authoritative reachability graph. The map records a separate possible-production proof so an operator can investigate without allowing a guess to mark code as definitely live.

### Dynamic imports are never silently dropped

A dynamic import that can be statically enumerated becomes dependency edges. A variable/expression that cannot be safely enumerated is retained in `dependencies.unresolved` with `resolution=dynamic-unresolved`. If such uncertainty exists on a production-reachable path, `summary.deadClassificationTrusted` becomes false; dead-code deletion must then stop until the blind spot is resolved or explicitly modeled.

### Case sensitivity

APEX is often developed on Windows, while build/release environments can be case-sensitive. A case-insensitive fallback can recover the intended edge for cartography, but the edge is annotated and the canonical QA requires zero case-mismatch resolutions. The source import spelling should be corrected instead of relying on the fallback.


## Symbol/declaration methodology

File liveness and export usage are separate analyses. The Function Atlas remains the canonical symbol inventory; APP_INDEX additionally records AST top-level declarations, module exports, and the exact imported symbol names carried by authoritative static edges. This enables an **unused-export candidate** query without confusing an unused export modifier with a dead function/file.

Unused-export findings are advisory only. Namespace imports, dynamic imports, CommonJS `require`, and other wildcard consumers suppress per-export claims because static named-use evidence is incomplete. No unused-export result is permission for automatic deletion. Parse diagnostics are stored explicitly; a file that cannot be parsed is never silently treated as symbol-empty evidence.

## Liveness methodology

Production liveness is **transitive reachability from explicit roots**. Current production roots are `server.ts`, `index.html`, and `src/main.tsx`. Tool/test/source-contract roots are tracked separately. A dead island is a weakly-connected component of code that is not reachable from production, test/tool, source-contract, or a conservatively modeled possible-production path.

Strongly-connected components are computed on the authoritative runtime graph. Cycles and dead islands are therefore graph properties, not raw import-count heuristics.

## History methodology

SQLite snapshots store file identity, versions, dependencies and symbols. Exact-content moves preserve identity with confidence `1.0`. Rename+edit lineage is explicitly probable and uses persisted line/symbol similarity; probable lineage never rewrites history as certainty. Git history remains a corroborating source when available.

## External methodology references

- SCIP Code Intelligence Protocol — symbol definitions, occurrences and relationships: https://github.com/scip-code/scip
- Knip — unresolved imports, path aliases, entry/project modeling: https://knip.dev/guides/handling-issues and https://knip.dev/reference/configuration
- TypeScript module resolution and `paths`/`baseUrl`: https://www.typescriptlang.org/docs/handbook/modules/theory.html and https://www.typescriptlang.org/tsconfig/moduleResolution.html
- Vite glob imports and variable dynamic imports: https://vite.dev/guide/features.html
- dependency-cruiser — orphan versus root reachability/dead wood and tsconfig-aware resolution: https://github.com/sverweij/dependency-cruiser
- Git rename/history semantics: https://git-scm.com/docs/git-diff and https://git-scm.com/docs/git-log
