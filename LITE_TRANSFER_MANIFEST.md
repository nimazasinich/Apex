# APEX v2.0.1 Lite Source Transfer

Purpose: compact, reproducible source handoff for continued development. This is not a FINAL release and does not replace the full CP21 evidence checkpoint.

## Provenance

- Parent checkpoint: `APEX-v2.0.1-CP21-BLOCKED-BROWSER-EVIDENCE.zip`
- Parent SHA-256: `6cf24ec37825e681929f9ca279e83802e60884d5d000f6d20909cb206a974c48`
- Source build ID: `apex-2.0.1-ee6332c1bcaf`
- Git metadata: unavailable in the supplied source archive

## Retained

- Production source, UI assets, server, tests, OpenAPI and QA/gate scripts
- Package manifest, exact lockfile and `vendor/` local tarballs required by `file:vendor/*`
- Essential documentation, remediation ledgers and safety constraints
- App Index schema, methodology, layer rules and generator/resolver source
- Non-secret environment templates and CI configuration

## Removed to reduce transfer size

- `node_modules/` and Playwright browser binaries
- `dist/` build output
- `QA/`, `_qa/` and `test-results/` generated evidence, screenshots and synthetic datasets
- `APP_INDEX/app-index.sqlite`, generated maps, graphs and tree output
- Generated Function/Documentation Index outputs
- `.agent-index/`, `.apex-data/`, `_release/` and `_archive/`
- Runtime databases, logs, caches, temporary files and SQLite journal/WAL/SHM files
- Private `.env` and provider/Telegram configuration files
- Previously generated ZIP and checksum files

No production source, provider integration, safety control, test implementation, OpenAPI definition or required local dependency tarball was intentionally removed.

## Rebuild

```bash
npm ci
npm run lint
npm test
npm run build
npm run index:app
npm run qa:app-index
npm run check:api-contract
npm run check:version
npm run check:build-identity
npm run release:gate:source
```

Browser verification still requires a compatible Chromium executable. The Lite archive SHA-256 is supplied in its external `.sha256` sidecar because embedding an archive's own digest is self-referential.
