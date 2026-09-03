/**
 * One-shot generator for Doc/repository/UNTRACKED_FILES_AUDIT.md
 * Usage: tsx scripts/utilities/generateRepositoryAudit.mts
 */
import { execSync } from 'node:child_process';
import { statSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outPath = join(root, 'Doc/repository/UNTRACKED_FILES_AUDIT.md');

type Cat =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L';

const CAT_LABEL: Record<Cat, string> = {
  A: 'Required application source',
  B: 'Required configuration',
  C: 'Required reusable script',
  D: 'Required test',
  E: 'Required documentation',
  F: 'Generated QA evidence',
  G: 'Build output',
  H: 'Dependency/cache',
  I: 'Log or screenshot',
  J: 'Environment/secret',
  K: 'Temporary or backup',
  L: 'Unknown and requiring inspection',
};

function gitLines(cmd: string): string[] {
  return execSync(cmd, { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
}

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function classify(p: string): Cat {
  if (p === 'server.ts' || p.startsWith('src/')) return 'A';
  if (
    ['tsconfig.json', 'vite.config.ts', 'index.html', 'package-lock.json'].includes(p) ||
    p.startsWith('public/')
  )
    return 'B';
  if (p.startsWith('scripts/')) return 'C';
  if (p.startsWith('tests/') || p.includes('/tests/')) return 'D';
  if (p.startsWith('Doc/') || p.endsWith('.md')) return 'E';
  if (p.startsWith('_qa/') || p.startsWith('qa/')) return 'F';
  if (p.startsWith('dist/') || p.startsWith('build/')) return 'G';
  if (p.startsWith('node_modules/')) return 'H';
  if (
    p.endsWith('.log') ||
    p.endsWith('.png') ||
    p.endsWith('.webm') ||
    p.startsWith('Print-Screen/')
  )
    return 'I';
  if (
    p === '.env' ||
    p.startsWith('.env.') ||
    p.endsWith('.config.json') ||
    p.includes('telegram.config')
  )
    return p === '.env.example' ? 'B' : 'J';
  if (
    p.startsWith('.tmp-') ||
    p.startsWith('temp/') ||
    p.startsWith('tmp/') ||
    p.startsWith('Archived/') ||
    p.startsWith('.cursor/') ||
    p.startsWith('.vscode/') ||
    p.startsWith('.kiro/') ||
    p.startsWith('.agent-index/')
  )
    return 'K';
  return 'L';
}

function purpose(p: string, cat: Cat): string {
  const map: Partial<Record<string, string>> = {
    'server.ts': 'Express + Vite dev/production server entry (`npm run dev:server`, `npm run build`)',
    'src/main.tsx': 'Vite client bootstrap referenced by index.html',
    'index.html': 'Vite HTML shell',
    'package-lock.json': 'Reproducible dependency lockfile for npm ci',
    '.env.example': 'Documented environment variable template (no secrets)',
    'Refrence.md': 'Agent navigation reference; linked from project docs',
    'metadata.json': 'Legacy project metadata; not referenced by build scripts',
    'build_log.txt': 'Local build log artifact',
    'cc-current-1672x941.png': 'Ad-hoc screenshot at repo root',
    'apex_visual_diff.py': 'Duplicate of scripts/apex_visual_diff.py at root',
    '_write_insightpanel.ps1': 'One-off PowerShell helper script',
  };
  if (map[p]) return map[p]!;
  if (cat === 'A') return 'Application source required for build/run/test';
  if (cat === 'C') return 'Reusable npm script target under package.json';
  if (cat === 'E') return 'Project documentation';
  if (cat === 'F') return 'Generated QA capture evidence (_qa/ gitignored)';
  if (cat === 'K') return 'Editor config, temp store, or archive — local only';
  if (cat === 'J') return 'Environment or secret file — must not commit';
  return 'Requires manual inspection';
}


let atlasUsageCache: Record<string, { usageStatus?: string }> | null | undefined;
function atlasUsage(): Record<string, { usageStatus?: string }> | null {
  if (atlasUsageCache !== undefined) return atlasUsageCache;
  try {
    const index = JSON.parse(readFileSync(join(root, 'Doc/FUNCTION_INDEX.json'), 'utf8')) as {
      fileUsage?: Record<string, { usageStatus?: string }>;
    };
    atlasUsageCache = index.fileUsage ?? null;
  } catch {
    atlasUsageCache = null;
  }
  return atlasUsageCache;
}

function referenced(p: string): string {
  if (p === 'server.ts' || p === 'src/main.tsx' || p === 'index.html') return 'Yes — package.json / Vite entry';
  if (p.startsWith('scripts/')) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
      const hit = Object.entries(pkg.scripts).some(([, v]) => v.includes(p.replace(/\\/g, '/')));
      return hit ? 'Yes — package.json script' : 'Indirect — imported by other scripts';
    } catch {
      return 'Unknown';
    }
  }
  if (p.startsWith('src/')) {
    const status = atlasUsage()?.[p]?.usageStatus;
    if (status === 'production-runtime') return 'Yes — production import graph';
    if (status === 'production-type-only') return 'Type-only — production graph';
    if (status === 'test-tool-only') return 'Yes — QA/test/tooling only';
    if (status === 'unreferenced-static') return 'No static consumer found — inspect dynamic use';
    return 'Unknown — function atlas usage graph unavailable';
  }
  if (p.startsWith('Doc/')) return 'Yes — documentation index / README';
  return 'No direct reference found';
}

function proposed(cat: Cat, p: string): string {
  if (cat === 'A' || cat === 'B' || cat === 'C' || cat === 'D' || cat === 'E') {
    if (p === '.env.example') return 'Track';
    if (p.startsWith('Doc/') || p.endsWith('.md')) return 'Track (relocate under Doc/ in org pass)';
    return 'Track';
  }
  if (cat === 'F' || cat === 'G' || cat === 'H' || cat === 'I' || cat === 'J' || cat === 'K') return 'Ignore / do not track';
  if (p === 'metadata.json') return 'Ignore — unused by build';
  if (p === 'Refrence.md') return 'Track → Doc/architecture/ or Doc/';
  return 'Inspect then decide';
}

function safeTrack(cat: Cat, p: string): string {
  if (cat === 'J' && p !== '.env.example') return 'No — secret risk';
  if (['A', 'B', 'C', 'D', 'E'].includes(cat)) return p === '.env.example' ? 'Yes (template only)' : 'Yes';
  return 'No';
}

function required(cat: Cat): string {
  return ['A', 'B', 'C', 'D'].includes(cat) ? 'Yes' : cat === 'E' ? 'Recommended' : 'No';
}

function hasSecrets(cat: Cat, p: string): string {
  if (p === '.env.example') return 'No — placeholders only';
  if (cat === 'J') return 'Yes or possible';
  return 'No';
}

function sizeOf(p: string): number {
  try {
    const st = statSync(join(root, p));
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

const hasGitMetadata = existsSync(join(root, '.git'));
const archiveExcludedDirectories = new Set(['.git', 'node_modules', 'dist', '.agent-index']);

function archiveFiles(directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && archiveExcludedDirectories.has(entry.name)) return [];
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return archiveFiles(absolute);
    return [relative(root, absolute).replaceAll('\\', '/')];
  });
}

const untracked = hasGitMetadata ? gitLines('git ls-files --others --exclude-standard') : archiveFiles();
const tracked = hasGitMetadata ? gitLines('git ls-files') : [];
const branch = hasGitMetadata ? execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim() : 'source-archive';
const head = hasGitMetadata ? execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim() : 'unavailable (archive has no .git metadata)';
const auditMode = hasGitMetadata ? 'Git working tree' : 'Source archive inventory';
const ignoredSample = [
  '_qa/',
  'dist/',
  'node_modules/',
  '.env',
  '.tmp-testnet-store-*.json',
  'coverage/',
  'playwright-report/',
  'test-results/',
];

const rows = untracked
  .map((p) => ({ p, cat: classify(p), size: sizeOf(p) }))
  .sort((a, b) => a.cat.localeCompare(b.cat) || a.p.localeCompare(b.p));

const byCat = new Map<Cat, number>();
for (const r of rows) byCat.set(r.cat, (byCat.get(r.cat) ?? 0) + 1);

mkdirSync(dirname(outPath), { recursive: true });

let md = `# Untracked Files Audit

**Generated:** ${new Date().toISOString()}
**Mode:** ${auditMode}
**Branch:** ${branch}
**HEAD:** \`${head}\`
**Accepted UI release:** \`desktop-visual-unification-v3.0.0\` → \`9d13e5845ccb2783b91e0cd6553612a92a94cf25\`

## Summary

| Metric | Count |
|--------|------:|
| Tracked files (pre-baseline) | ${tracked.length} |
| Untracked non-ignored paths | ${untracked.length} |
| Category A (application source) | ${byCat.get('A') ?? 0} |
| Category B (configuration) | ${byCat.get('B') ?? 0} |
| Category C (scripts) | ${byCat.get('C') ?? 0} |
| Category D (tests) | ${byCat.get('D') ?? 0} |
| Category E (documentation) | ${byCat.get('E') ?? 0} |
| Category F–K (generated/local) | ${['F', 'G', 'H', 'I', 'J', 'K'].reduce((s, c) => s + (byCat.get(c as Cat) ?? 0), 0)} |
| Category L (unknown) | ${byCat.get('L') ?? 0} |

## Classification legend

| Code | Meaning |
|------|---------|
${Object.entries(CAT_LABEL)
  .map(([k, v]) => `| **${k}** | ${v} |`)
  .join('\n')}

## Ignored paths (sample — via .gitignore)

${ignoredSample.map((p) => `- \`${p}\``).join('\n')}

## Full untracked inventory

| Path | Cat | Size | Purpose | Referenced | Required | Safe to track | Secrets | Proposed action |
|------|-----|------|---------|------------|----------|---------------|---------|-----------------|
`;

for (const r of rows) {
  const esc = r.p.replace(/\|/g, '\\|');
  md += `| \`${esc}\` | ${r.cat} | ${fmtBytes(r.size)} | ${purpose(r.p, r.cat)} | ${referenced(r.p)} | ${required(r.cat)} | ${safeTrack(r.cat, r.p)} | ${hasSecrets(r.cat, r.p)} | ${proposed(r.cat, r.p)} |\n`;
}

md += `
## Tracked files at audit time (${tracked.length})

\`\`\`
${tracked.join('\n')}
\`\`\`
`;

writeFileSync(outPath, md);
console.log(`Wrote ${outPath} (${rows.length} untracked entries)`);
