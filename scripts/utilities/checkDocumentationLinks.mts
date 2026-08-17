import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd());

/**
 * Build and dependency trees, matched per path segment.
 *
 * A `startsWith` test was wrong in both directions. It missed every nested tree,
 * so `.mcp-recovered/<server>/node_modules/**` was walked and 542 third-party
 * README links were reported as project failures, burying the real ones. And it
 * over-matched any top-level name that merely begins with these strings, so a
 * `distribution/` or `templates/` document would have been skipped silently —
 * the worse half, because a skipped file cannot fail.
 */
const EXCLUDED_SEGMENTS = new Set(['node_modules', 'dist', 'temp']);
const isExcluded = (path: string): boolean =>
  // readdirSync reports native separators, so split on both rather than assuming posix.
  path.split(/[\\/]/).some(segment => EXCLUDED_SEGMENTS.has(segment));

const markdownFiles = (await import('node:fs')).readdirSync(ROOT, { recursive: true })
  .filter((path): path is string => typeof path === 'string')
  .filter(path => path.endsWith('.md'))
  .filter(path => !isExcluded(path));

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const failures: string[] = [];

for (const relativePath of markdownFiles as string[]) {
  const filePath = resolve(ROOT, relativePath);
  const source = readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (!target || /^(https?:|mailto:|#)/i.test(target)) continue;
    const localTarget = target.split('#', 1)[0].split('?', 1)[0].replace(/^<|>$/g, '');
    if (!localTarget) continue;
    let decodedTarget = localTarget;
    try {
      decodedTarget = decodeURIComponent(localTarget);
    } catch {
      failures.push(`${relativePath} -> ${target} (invalid URL encoding)`);
      continue;
    }
    const resolved = resolve(dirname(filePath), decodedTarget);
    if (!existsSync(resolved)) failures.push(`${relativePath} -> ${target}`);
  }
}

if (failures.length) {
  console.error('Broken documentation links:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${markdownFiles.length} Markdown files; no broken local links found.`);
}
