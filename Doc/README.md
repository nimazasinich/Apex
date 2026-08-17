# APEX Current Documentation

This `Doc/` tree is the canonical documentation surface for the current APEX source package. The current source is **v1.0.58**. The present delivery is **evidence-rich**, not a minimal/lightweight source-only bundle: it intentionally includes current documentation, historical reports, visual references, generated documentation/function indexes, and selected QA/release evidence. Runtime/local secret configuration is not documentation and must never be included in a release.

## Primary documents

| Path | Purpose |
|---|---|
| [`PROJECT_README.md`](PROJECT_README.md) | Project entry point and commands |
| [`reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md`](reports/final/APEX_V1_0_58_SIMULATION_QUALIFICATION_AND_REMEDIATION.md) | Current v1.0.58 remediation, verification, and external qualification status |
| [`reports/CURRENT_STATUS.md`](reports/CURRENT_STATUS.md) | Current-vs-historical report classification |
| [`architecture/Refrence.md`](architecture/Refrence.md) | Mandatory agent navigation rules and current audit refresh |
| [`repository/PROJECT_STRUCTURE_2026-08-10.md`](repository/PROJECT_STRUCTURE_2026-08-10.md) | 2026-08-10 architecture/subsystem snapshot (historical baseline) |
| [`repository/FILE_INDEX_2026-08-10.md`](repository/FILE_INDEX_2026-08-10.md) | 2026-08-10 file-level snapshot and checksums |
| [`repository/API_ROUTE_INDEX_2026-08-10.md`](repository/API_ROUTE_INDEX_2026-08-10.md) | 2026-08-10 runtime API/OpenAPI snapshot |
| [`reports/final/APEX_COMPREHENSIVE_PROJECT_AUDIT_2026-08-10.md`](reports/final/APEX_COMPREHENSIVE_PROJECT_AUDIT_2026-08-10.md) | Historical 2026-08-10 architecture/QA/deficiency audit |
| [`plans/active/APEX_V31_AGENT_IMPLEMENTATION_PLAN_EN.md`](plans/active/APEX_V31_AGENT_IMPLEMENTATION_PLAN_EN.md) | V31 consolidation and feature-recovery plan |
| [`repository/ROOT_CONTRACT.md`](repository/ROOT_CONTRACT.md) | Root placement rules |
| [`repository/VIEWPORT_1368x753_CONTRACT.md`](repository/VIEWPORT_1368x753_CONTRACT.md) | Canonical desktop viewport contract |
| [`tools/APEX_PROJECT_INTELLIGENCE_HUB_WINDOWS.md`](tools/APEX_PROJECT_INTELLIGENCE_HUB_WINDOWS.md) | Windows Hub setup and removal |

## Generated indexes and outputs

The following are generated artifacts. They are included in this evidence-rich delivery for navigation/auditability, but may be regenerated:

```text
Doc/FUNCTION_INDEX.md
Doc/FUNCTION_INDEX.json
Doc/DOCUMENTATION_INDEX.md
Doc/DOCUMENTATION_INDEX.json
Doc/generated/APEX_COMPLETE_VISUAL_PROJECT_DOCUMENTATION.html
```

The function index has a freshness finding in the 2026-08-10 comprehensive audit and should be regenerated on a dependency-complete machine after accepted code changes.

## QA evidence and archives

`QA/`, `_qa/`, and `_archive/` are not production runtime source. The root contract treats QA evidence as ignored/generated material. This delivery keeps selected evidence and historical archives because it is intended to support audit and handoff. A production source release should package source/config/templates separately from bulky QA/archive evidence.

## Regeneration and checks

```bash
npm run index:functions
npm run index:docs
npm run docs:visual
npm run docs:check
npm run clean:artifacts
```

Do not store credentials or local provider tokens in `Doc/`, QA evidence, or release archives.

<!-- APEX_VISUAL_ARCHITECTURE_CANONICAL -->
## Canonical Visual Architecture

- [Interactive Visual Architecture & File Layer Atlas](generated/APEX_COMPLETE_VISUAL_PROJECT_DOCUMENTATION.html)
- [System Layers & File Layer Map](architecture/APEX_SYSTEM_LAYERS.md)
- [Integrated Complete Architecture Audit Overlay](architecture/APEX_ARCHITECTURE_COMPLETE_INTEGRATION.md)
- [Submitted Complete Architecture Artifact](architecture/APEX_v1.0.56_ARCHITECTURE_COMPLETE_SUBMITTED.html)

The interactive document distinguishes current implementation, intentionally blocked safety behavior, and **Required Next / NOT IMPLEMENTED** architecture.
