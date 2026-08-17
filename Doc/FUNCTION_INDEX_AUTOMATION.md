# Function Index Automation

Last updated: 2026-07-28

## Goal

Whenever a function, class, method, hook, or component is **added or changed**,
the atlas must detect it and update:

- `Doc/FUNCTION_INDEX.md`
- `Doc/FUNCTION_INDEX.json`
- `.agent-index/functions_index.json`

No fabricated symbols — only real AST-parsed declarations from watched trees:
`server.ts`, `src/`, `scripts/`, `tests/`.

## How detection works

1. Each source file is hashed (SHA-256 truncated) into `file_hashes` inside
   `.agent-index/functions_index.json`.
2. On a trigger, hashes are recomputed.
3. **If any hash differs or a file appears/disappears** → full re-scan → rewrite
   outputs → console lists **new** `file::qualname` symbols.
4. **If hashes match** → skip (print `up to date` / `no hash change — skip`).

## Automatic triggers

| Trigger | Entry point |
|---------|-------------|
| Local development | `npm run dev` → [`scripts/utilities/devWithFunctionIndex.mts`](../scripts/utilities/devWithFunctionIndex.mts) runs server + `--watch` |
| Cursor / Tab edits | optional local `.cursor/hooks.json` → `reindex-functions.mjs` → `--if-changed` (editor-local tooling is intentionally not shipped in release archives) |
| Production build | `npm run build` runs the hash-aware `--if-changed` index gate |
| Manual | `npm run index:functions` (force) or `npm run index:functions:check` (hash gate) |

## Query (agents)

```bash
npm run index:functions:query -- ClankAppProvider
npm run index:functions:query -- "^fetchHf"
```

Prefer the query CLI (or `.agent-index/functions_index.json`) before grepping the
whole repository.

## Related

- [`../scripts/utilities/subfinder/README.md`](tools/subfinder/README.md)
- Optional editor-local rule: `.cursor/rules/function-index.mdc` (not shipped in release archives)
- Generator: [`../scripts/utilities/generateFunctionIndex.mts`](../scripts/utilities/generateFunctionIndex.mts)
