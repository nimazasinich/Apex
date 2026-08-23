#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const base = `apex-unified-terminal-v${pkg.version}`;
const releaseDir = resolve(root, '_release');
const paths = {
  source: resolve(releaseDir, `${base}.zip`),
  build: resolve(releaseDir, `${base}-build.zip`),
  evidence: resolve(releaseDir, `${base}-evidence.zip`),
  manifest: resolve(releaseDir, 'release-manifest.json'),
};
const errors = [];
for (const [kind, path] of Object.entries(paths)) if (!existsSync(path)) errors.push(`missing_${kind}_artifact`);

export function normalizeArchiveEntryPath(name) {
  return String(name).replaceAll('\\', '/').replace(/^\.\//, '');
}

function entries(path) {
  try {
    const buffer = readFileSync(path);
    let eocd = -1;
    for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 0xffff - 22); offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('zip_eocd_not_found');
    const totalEntries = buffer.readUInt16LE(eocd + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
    const rows = [];
    let offset = centralDirectoryOffset;
    for (let index = 0; index < totalEntries; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip_central_directory_malformed');
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      // ZIP APPNOTE 4.4.17.1 requires '/' as the entry separator, but PowerShell's
      // Compress-Archive — the fallback createReleaseArchive.mts takes when Info-ZIP
      // is not on PATH, which is the normal case on a stock Windows box — writes
      // `dir\file`. The archives themselves are fine; only this reader misread them.
      //
      // Normalizing at decode time rather than per call site is a correctness fix,
      // not tidiness: assertNoForbidden splits on '/', so an un-normalized
      // `app\node_modules\x` collapses to one segment and the node_modules and
      // runtime-secret gates silently never fire. The leading './' strip covers the
      // Info-ZIP branch and any other tool that records the archive root.
      const name = normalizeArchiveEntryPath(
        buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
      );
      rows.push(name);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return rows.filter(Boolean);
  } catch (error) {
    errors.push(`cannot_list_${path}:${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
function hasPrefix(rows, prefix) { return rows.some((row) => row === prefix || row.startsWith(`${prefix}/`)); }
function assertNoForbidden(kind, rows) {
  const forbiddenNames = ['.env', '.env.local', '.env.txt', '.external-api-sources.config.json', '.supplemental.config.json', '.telegram.config.json'];
  for (const row of rows) {
    const segments = row.split('/');
    if (segments.includes('node_modules')) errors.push(`${kind}_contains_node_modules:${row}`);
    if (segments.some((segment) => forbiddenNames.includes(segment))) errors.push(`${kind}_contains_runtime_secret:${row}`);
  }
}

function runPolicySelfTest() {
  const failures = [];
  const windowsBuild = [
    'dist\\index.html',
    'dist\\assets\\index.js',
  ].map(normalizeArchiveEntryPath);
  if (!hasPrefix(windowsBuild, 'dist')) failures.push('windows_dist_prefix_not_recognized');

  const cleanErrorCount = errors.length;
  assertNoForbidden('self_test', windowsBuild);
  if (errors.length !== cleanErrorCount) failures.push('clean_windows_rows_rejected');

  const forbiddenStart = errors.length;
  assertNoForbidden('self_test', [
    normalizeArchiveEntryPath('app\\node_modules\\pkg\\README.md'),
    normalizeArchiveEntryPath('app\\private\\.env.local'),
  ]);
  const forbiddenErrors = errors.splice(forbiddenStart);
  if (!forbiddenErrors.some((row) => row.includes('contains_node_modules'))) failures.push('windows_node_modules_not_rejected');
  if (!forbiddenErrors.some((row) => row.includes('contains_runtime_secret'))) failures.push('windows_secret_not_rejected');

  if (hasPrefix(['assets/index.js'], 'dist')) failures.push('missing_dist_not_rejected');
  if (failures.length) {
    console.error('[release-artifacts-self-test] FAILED');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }
  console.log('[release-artifacts-self-test] passed: Windows separators, forbidden entries, and missing-dist rejection verified.');
  process.exit(0);
}

if (process.argv.includes('--self-test')) runPolicySelfTest();

if (!errors.length) {
  const source = entries(paths.source);
  const build = entries(paths.build);
  const evidence = entries(paths.evidence);
  assertNoForbidden('source', source); assertNoForbidden('build', build); assertNoForbidden('evidence', evidence);
  if (hasPrefix(source, 'dist')) errors.push('source_contains_dist');
  if (!hasPrefix(source, 'vendor')) errors.push('source_missing_vendor_lockfile_inputs');
  if (!source.includes('package-lock.json')) errors.push('source_missing_lockfile');
  if (!source.includes('.nvmrc') || !source.includes('.node-version')) errors.push('source_missing_runtime_version_files');
  if (!hasPrefix(build, 'dist')) errors.push('build_missing_dist');
  if (hasPrefix(build, 'src')) errors.push('build_contains_source_tree');
  if (hasPrefix(evidence, 'dist')) errors.push('evidence_contains_dist');
  const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  if (manifest.applicationVersion !== pkg.version) errors.push('manifest_version_mismatch');
  if (!manifest.hashes?.sourceArtifactSha256 || !manifest.hashes?.buildArtifactSha256 || !manifest.hashes?.evidenceArtifactSha256) errors.push('manifest_missing_artifact_hashes');
  if (!manifest.hashes?.lockfileSha256 || !manifest.hashes?.openApiSha256 || !manifest.hashes?.functionIndexSha256 || !manifest.hashes?.apiRouteIndexSha256) errors.push('manifest_missing_contract_hashes');
}

if (errors.length) {
  console.error('[release-artifacts] FAILED');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('[release-artifacts] passed: source/build/evidence separation, required vendor inputs, forbidden-entry gates, and manifest hashes verified.');
