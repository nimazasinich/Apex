# Execution Environment (Windows-only)

Hard requirement: build/run/verify natively on Windows. Do NOT adapt deps / package.json / package-lock.json / native pkgs / source for Linux. Do NOT install Linux Rollup/esbuild packages.

## Tool division
- Desktop Commander → PowerShell, npm scripts, build, runtime & process control on the real Windows host.
- Playwright (1.61) → browser geometry, viewport sizing, screenshots, visual + workspace-runtime checks.
- Serena → code navigation and targeted symbolic edits.

## Prohibitions
- No Cowork Linux workspace. No `/sessions/.../mnt/` paths — that is a separate Linux sandbox, NOT the Windows source tree; never verify APEX there.
- Do NOT run `npm install`.
- Do NOT modify package.json / package-lock.json unless the user explicitly requests it.
- No custom preflight runners, orchestration helpers, curated gate subsets, or intermediate status/task `.md` files — use canonical scripts.
- Preserve unrelated user files and changes.

## Canonical QA viewport
1368×753. Visual gate qa:ui-1368 → scripts/qa/verifyUi1368.mjs; verify:visual = qa:ui-1368 && qa:workspace-runtime. Visual gates serve LIVE source via vite middleware, so UI can be re-checked without a rebuild.

## MCP / DC operational limits
Long MCP tool calls cap around ~90s. In Desktop Commander avoid bare `$VAR` and unix process-list idioms (they break); set the correct cwd for Playwright runs.
