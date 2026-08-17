# APEX Project Intelligence Hub — Windows x64

The project root includes the standalone Windows x64 executable:

```text
APEXProjectHub.exe
```

Verified SHA-256:

```text
36cfec27c096c408c4920e07ddaa0aaaf5ed4df7c0e5bf843be967720f2f0f00
```

The checksum is also stored in `APEXProjectHub.exe.sha256`.

## Initial installation

1. Keep `APEXProjectHub.exe` beside `package.json` in the project root.
2. On a Windows x64 machine, double-click the executable once.
3. After initial installation, the Hub is invoked automatically by:

```powershell
npm run dev
npm run build
```

Windows does not run an executable merely because it was copied into a folder, so the one-time initial execution is required.

## Runtime behavior

During `npm run dev`, the Hub:

- performs an initial scan;
- starts the original development command;
- watches project files;
- incrementally processes changed files;
- refreshes the dependency graph and reports.

During `npm run build`, the Hub:

- performs a full pre-build scan;
- executes the original build command;
- scans the project again after the build;
- can stop the build for configured critical findings.

## Generated output

The Hub creates the following local directory in the project root:

```text
.apex-index/
```

Expected output files:

```text
project-index.db.json
project-index.csv
api-contract.csv
findings.json
PROJECT_INDEX.md
project-index.html
hub.log
```

The generated index can include file purpose, imports, reverse imports, exports, API usage, runtime/test/QA status, orphan and duplicate indicators, line counts, hashes, and detected findings.

## Project changes made by the Hub

The executable is expected to leave source files untouched. During installation it can:

- create `package.json.apex-hub.bak`;
- preserve the original scripts as `hub:dev:original` and `hub:build:original`;
- connect its wrapper to the `dev` and `build` scripts;
- create `.apex-hub.json`.

## Uninstall

Run from PowerShell in the project root:

```powershell
.\APEXProjectHub.exe uninstall
```

## Security and platform notes

- The included binary is a PE32+ Windows x86-64 console executable.
- It is not commercially code-signed, so Microsoft SmartScreen may display a warning on first execution.
- The executable was not run in the Linux packaging environment. Only its file type and SHA-256 checksum were verified.
- Review the generated `package.json` changes after the initial Windows installation before committing them.
