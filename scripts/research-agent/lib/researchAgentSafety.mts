import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const FORBIDDEN_SEALED_FLAG = '--evaluate-sealed';
export const CANDIDATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function assertCandidateId(id: string): void {
  if (!CANDIDATE_ID_RE.test(id)) {
    throw new Error(
      `Invalid candidate id "${id}". Use 1-80 lowercase letters, digits, and hyphens only.`,
    );
  }
}

export function assertSafeHypothesisText(text: string | undefined): void {
  if ((text ?? '').includes(FORBIDDEN_SEALED_FLAG)) {
    throw new Error(
      `[SAFETY] Hypothesis text contains reserved sealed-holdout flag "${FORBIDDEN_SEALED_FLAG}". ` +
      'Keep queue metadata descriptive; sealed evaluation is controlled only by openHoldout.mts.',
    );
  }
}

/**
 * Resolve a queue study path and prove it remains inside scripts/research/*.mts.
 * Queue entries are intentionally POSIX-style project-relative paths so the same
 * JSON is stable on Windows and Unix.
 */
export function resolveResearchStudyPath(root: string, script: string, requireExists = true): string {
  if (typeof script !== 'string' || script.length === 0) {
    throw new Error('Study path must be a non-empty string.');
  }
  if (script.includes('\\') || path.isAbsolute(script) || script.includes('\0')) {
    throw new Error(`[SAFETY] Study path must be a POSIX-style project-relative path: ${script}`);
  }
  if (!script.startsWith('scripts/research/') || !script.endsWith('.mts')) {
    throw new Error(`[SAFETY] Study must be a scripts/research/*.mts file: ${script}`);
  }

  const researchRoot = path.resolve(root, 'scripts/research');
  const absolute = path.resolve(root, script);
  const relative = path.relative(researchRoot, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`[SAFETY] Study path escapes scripts/research: ${script}`);
  }
  if (requireExists && !existsSync(absolute)) {
    throw new Error(`Study script not found: ${script}`);
  }
  return absolute;
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function studySupportsSealedEvaluation(filePath: string): boolean {
  const source = readFileSync(filePath, 'utf8');
  return /process\.argv\.includes\(\s*['"]--evaluate-sealed['"]\s*\)/.test(source);
}

export function resolveLocalTsxCli(root: string): string {
  const packagePath = path.join(root, 'node_modules', 'tsx', 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error('[ENV] Local tsx is not installed. Run npm ci first; research-agent will not fetch tooling from the network.');
  }
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsx;
  if (!bin) throw new Error('[ENV] Installed tsx package has no declared CLI bin.');
  const packageRoot = path.dirname(packagePath);
  const cliPath = path.resolve(packageRoot, bin);
  const relative = path.relative(packageRoot, cliPath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(cliPath)) {
    throw new Error('[ENV] Installed tsx CLI path is invalid or missing. Re-run npm ci.');
  }
  return cliPath;
}
