#!/usr/bin/env tsx
/**
 * Creates three provenance-separated APEX release artifacts:
 *   A. clean source release (legacy archive name retained for compatibility),
 *   B. build/deploy artifact,
 *   C. QA/evidence artifact.
 *
 * The source artifact is allowlist-only and never includes node_modules, dist,
 * runtime secrets, mutable state, QA captures, or historical evidence. Local
 * file: dependencies referenced by package-lock.json are included from vendor/.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string; engines?: Record<string, string> };
const version = pkg.version ?? '0.0.0';
const outDir = join(root, '_release');

// Keep this exact template string: checkVersionIdentity.mjs verifies it.
const sourceArchiveName = `apex-unified-terminal-v${version}.zip`;
const buildArchiveName = `apex-unified-terminal-v${version}-build.zip`;
const evidenceArchiveName = `apex-unified-terminal-v${version}-evidence.zip`;

const forbiddenBasenames = new Set([
  '.env', '.env.local', '.env.txt', '.external-api-sources.config.json',
  '.supplemental.config.json', '.telegram.config.json',
]);
const forbiddenSegments = new Set(['node_modules', '.apex-data', '.apex-private-data', '_qa', 'coverage']);

function sha256Buffer(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}
function sha256File(path: string): string | null {
  return existsSync(path) && statSync(path).isFile() ? sha256Buffer(readFileSync(path)) : null;
}
function listFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listFiles(full, rel));
    else if (stat.isFile()) out.push(rel);
  }
  return out;
}
function hashTree(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const hash = createHash('sha256');
  for (const rel of listFiles(dir)) {
    hash.update(rel.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
function command(args: string[]): string | null {
  try { return execFileSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function safeCopy(sourceRel: string, stageDir: string, filter?: (source: string) => boolean): void {
  const source = join(root, sourceRel);
  if (!existsSync(source)) return;
  const dest = join(stageDir, sourceRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true, filter });
}
function sourceFilter(source: string): boolean {
  const rel = relative(root, source).replaceAll('\\', '/');
  if (!rel) return true;
  const parts = rel.split('/');
  if (forbiddenBasenames.has(parts.at(-1) || '')) return false;
  if (parts.some((part) => forbiddenSegments.has(part))) return false;
  if (rel.startsWith('Doc/reports/final/') || rel.startsWith('Doc/reports/historical/') || rel.startsWith('Doc/automation/')) return false;
  if (rel.startsWith('Doc/') && new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']).has(extname(rel).toLowerCase())) return false;
  return true;
}
function zipStage(stageDir: string, archivePath: string): void {
  if (existsSync(archivePath)) rmSync(archivePath, { force: true });
  try {
    execFileSync('zip', ['-r', '-q', archivePath, '.'], { cwd: stageDir, stdio: 'inherit' });
    return;
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code !== 'ENOENT') throw error;
  }
  const commandText = [
    '$ErrorActionPreference = "Stop"',
    `$items = Get-ChildItem -LiteralPath ${JSON.stringify(stageDir)} -Force`,
    `Compress-Archive -LiteralPath $items.FullName -DestinationPath ${JSON.stringify(archivePath)} -Force`,
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', commandText], { cwd: stageDir, stdio: 'inherit' });
}
function writeSidecar(archivePath: string): string {
  const digest = sha256File(archivePath)!;
  const sha256Path = `${archivePath}.sha256`;
  writeFileSync(sha256Path, `${digest}  ${basename(archivePath)}\n`);
  return digest;
}
function ensureNoForbiddenStageEntries(stageDir: string): void {
  for (const rel of listFiles(stageDir)) {
    const parts = rel.split('/');
    if (forbiddenBasenames.has(parts.at(-1) || '') || parts.some((part) => forbiddenSegments.has(part))) {
      throw new Error(`forbidden_release_entry:${rel}`);
    }
  }
}

const sourceAllowlist = [
  'src', 'public', 'server.ts', 'index.html', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vite.config.ts', 'scripts', 'tests', 'vendor', 'openapi', 'tools',
  '.github', '.env.example', '.external-api-sources.config.example.json', '.gitignore',
  '.nvmrc', '.node-version', 'README.txt', 'VERSION', 'RUN-APEX.bat', 'Doc',
];
const evidenceAllowlist = [
  'Doc/reports/final', 'Doc/FUNCTION_INDEX.md', 'Doc/FUNCTION_INDEX.json',
  'Doc/DOCUMENTATION_INDEX.md', 'Doc/DOCUMENTATION_INDEX.json',
  'Doc/repository/API_ROUTE_INDEX_2026-08-10.md', 'Doc/repository/API_ROUTE_INDEX_2026-08-10.json',
  'openapi', 'QA',
];

function main(): void {
  execFileSync('node', [join(root, 'scripts/gates/checkNoSecretsInRelease.mjs')], { cwd: root, stdio: 'inherit' });
  mkdirSync(outDir, { recursive: true });

  const sourceStage = mkdtempSync(join(tmpdir(), 'apex-source-'));
  for (const rel of sourceAllowlist) safeCopy(rel, sourceStage, sourceFilter);
  ensureNoForbiddenStageEntries(sourceStage);
  const sourceTreeHash = hashTree(sourceStage);
  const sourceArchivePath = join(outDir, sourceArchiveName);
  zipStage(sourceStage, sourceArchivePath);
  const sourceArchiveHash = writeSidecar(sourceArchivePath);
  rmSync(sourceStage, { recursive: true, force: true });

  const commit = command(['git', 'rev-parse', 'HEAD']) || 'unavailable';
  const dirtyOutput = command(['git', 'status', '--porcelain']);
  const dirtyTree: boolean | 'unavailable' = commit === 'unavailable' ? 'unavailable' : Boolean(dirtyOutput);
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    applicationVersion: version,
    generatedAt: new Date().toISOString(),
    provenance: {
      commit,
      dirtyTree,
      nodeVersion: process.version,
      npmVersion: command(['npm', '--version']) || 'unavailable',
      platform: process.platform,
      architecture: process.arch,
      engines: pkg.engines ?? null,
    },
    hashes: {
      lockfileSha256: sha256File(join(root, 'package-lock.json')),
      sourceTreeSha256: sourceTreeHash,
      sourceArtifactSha256: sourceArchiveHash,
      distTreeSha256: hashTree(join(root, 'dist')),
      openApiSha256: sha256File(join(root, 'openapi/apex-api.v1.yaml')),
      functionIndexSha256: sha256File(join(root, 'Doc/FUNCTION_INDEX.json')),
      apiRouteIndexSha256: sha256File(join(root, 'Doc/repository/API_ROUTE_INDEX_2026-08-10.json')),
    },
    artifacts: {
      source: sourceArchiveName,
      build: buildArchiveName,
      evidence: evidenceArchiveName,
    },
    sourcePolicy: {
      includesNodeModules: false,
      includesDist: false,
      includesRuntimeSecrets: false,
      includesVendoredLockfileInputs: true,
    },
  };

  const manifestPath = join(outDir, 'release-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (existsSync(join(root, 'dist'))) {
    const buildStage = mkdtempSync(join(tmpdir(), 'apex-build-'));
    safeCopy('dist', buildStage);
    safeCopy('package.json', buildStage);
    writeFileSync(join(buildStage, 'BUILD_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    ensureNoForbiddenStageEntries(buildStage);
    const buildArchivePath = join(outDir, buildArchiveName);
    zipStage(buildStage, buildArchivePath);
    const buildHash = writeSidecar(buildArchivePath);
    (manifest.hashes as Record<string, unknown>).buildArtifactSha256 = buildHash;
    rmSync(buildStage, { recursive: true, force: true });
  } else {
    (manifest.hashes as Record<string, unknown>).buildArtifactSha256 = null;
    (manifest as any).buildArtifactStatus = 'NOT_CREATED_DIST_MISSING';
  }

  const evidenceStage = mkdtempSync(join(tmpdir(), 'apex-evidence-'));
  for (const rel of evidenceAllowlist) safeCopy(rel, evidenceStage);
  writeFileSync(join(evidenceStage, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  ensureNoForbiddenStageEntries(evidenceStage);
  const evidenceArchivePath = join(outDir, evidenceArchiveName);
  zipStage(evidenceStage, evidenceArchivePath);
  const evidenceHash = writeSidecar(evidenceArchivePath);
  (manifest.hashes as Record<string, unknown>).evidenceArtifactSha256 = evidenceHash;
  rmSync(evidenceStage, { recursive: true, force: true });

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'CHECKSUMS.sha256'), [sourceArchiveName, buildArchiveName, evidenceArchiveName]
    .filter((name) => existsSync(join(outDir, name)))
    .map((name) => `${sha256File(join(outDir, name))}  ${name}`)
    .join('\n') + '\n');

  console.log(`[release] source   ${sourceArchiveName} (${(statSync(sourceArchivePath).size / 1024 / 1024).toFixed(2)} MiB)`);
  if (existsSync(join(outDir, buildArchiveName))) console.log(`[release] build    ${buildArchiveName}`);
  console.log(`[release] evidence ${evidenceArchiveName}`);
  console.log('[release] wrote release-manifest.json and CHECKSUMS.sha256');
}

main();
