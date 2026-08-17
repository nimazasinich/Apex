# Function Index (subfinder) — automatic atlas

The function index **detects new and changed functions automatically** and rebuilds when source hashes change. You do not need to remember to re-run the indexer during normal development.

## Automatic triggers

| Trigger | What happens |
|---------|----------------|
| `npm run dev` | Starts APEX **and** the index watcher. On every save under `server.ts` / `src` / `scripts` / `tests`, hashes are compared; if a file changed, symbols are re-indexed and **new functions are listed** in the console. |
| Cursor agent/tab edit | `.cursor/hooks/reindex-functions.mjs` runs `npm run index:functions:check` after TS/JS edits. |
| `npm run build` | Full index rebuild at the end of the production build. |

Hash gate: if nothing changed, the indexer prints `up to date` / `no hash change — skip` and does not rewrite files.

## Commands

```bash
# Normal development (server + auto-index)
npm run dev

# Server only
npm run dev:server

# Force rebuild
npm run index:functions

# Rebuild only when sources changed
npm run index:functions:check

# Watcher alone
npm run index:functions:watch

# Fast lookup (prefer this over repo-wide grep)
npm run index:functions:query -- ClankAppProvider
npm run index:functions:query -- "^fetchHf"
```

## Outputs

| Path | Audience |
|------|----------|
| `.agent-index/functions_index.json` | Agents — name, qualname, file, line range, signature, docstring, tags |
| `Doc/FUNCTION_INDEX.md` | Humans — browsable atlas |
| `Doc/FUNCTION_INDEX.json` | Machines / docs tooling |

## Python helpers (optional)

Primary stack is TypeScript. For any `.py` files:

```bash
python scripts/subfinder/build_function_index.py .
python scripts/subfinder/query_function.py SomePythonFn
```

## Agent rule

Project rule: `.cursor/rules/function-index.mdc` (always apply).
