import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DOC_ROOT = join(ROOT, 'Doc');
const OUT_MD = join(DOC_ROOT, 'DOCUMENTATION_INDEX.md');
const OUT_JSON = join(DOC_ROOT, 'DOCUMENTATION_INDEX.json');
const IF_CHANGED = process.argv.includes('--if-changed');

type DocCategory = 'active' | 'automation' | 'generated-output' | 'historical' | 'source' | 'visual' | 'audit' | 'release';

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => a[key] === b[key]);
}

function loadPreviousHashes(): Record<string, string> | null {
  if (!existsSync(OUT_JSON)) return null;
  try {
    const parsed = JSON.parse(readFileSync(OUT_JSON, 'utf8')) as { fileHashes?: Record<string, string> };
    return parsed.fileHashes ?? null;
  } catch {
    return null;
  }
}

interface DocumentationEntry {
  path: string;
  category: DocCategory;
  format: string;
  title: string;
  bytes: number;
  updatedAt: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function titleFor(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  if (extname(path).toLowerCase() === '.md') {
    const heading = readFileSync(path, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading.replace(/^APEX Documentation Index$/, 'Documentation Index');
  }
  if (extname(path).toLowerCase() === '.html') {
    const title = readFileSync(path, 'utf8').match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim();
    if (title) return title;
  }
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
}

function categoryFor(path: string): DocCategory {
  const rel = relative(DOC_ROOT, path).replaceAll('\\', '/');
  const base = rel.split('/').pop() ?? rel;
  if (rel.startsWith('archive/')) return 'historical';
  if (rel.startsWith('master/')) return 'historical';
  if (rel.startsWith('plans/archive/')) return 'historical';
  if (rel.startsWith('reports/historical/')) return 'historical';
  if (rel.startsWith('source/')) return 'source';
  if (rel.startsWith('visual/') || rel.startsWith('reference/') || rel.startsWith('references/')) return 'visual';
  if (rel.startsWith('audit/')) return 'audit';
  if (rel.startsWith('release-history/') || rel.startsWith('reports/final/') || rel.startsWith('handoff/')) return 'release';
  if (rel.startsWith('generated/')) return 'generated-output';
  if (
    rel.startsWith('automation/') &&
    (rel.includes('/load_matrix_') ||
      rel.includes('/ml_dataset/') ||
      /(^|\/)(.*RESULT|.*SUMMARY|.*REPORT)_v?\d*\.(md|json)$/i.test(rel))
  ) return 'generated-output';
  if (rel.startsWith('automation/')) return 'automation';
  if (base === 'FUNCTION_INDEX.md' || base === 'FUNCTION_INDEX.json' || base === 'DOCUMENTATION_INDEX.md' || base === 'DOCUMENTATION_INDEX.json') {
    return 'generated-output';
  }
  return 'active';
}

const sourcePaths = walk(DOC_ROOT)
  .filter(path => !path.endsWith('DOCUMENTATION_INDEX.md') && !path.endsWith('DOCUMENTATION_INDEX.json'));

const fileHashes = Object.fromEntries(
  sourcePaths.map(path => [relative(DOC_ROOT, path).replaceAll('\\', '/'), fileHash(path)]),
);

if (IF_CHANGED) {
  const previousHashes = loadPreviousHashes();
  if (previousHashes && hashesEqual(previousHashes, fileHashes)) {
    console.log(`Documentation index is up to date (${sourcePaths.length} files) — no content hash changes.`);
    process.exit(0);
  }
}

const entries: DocumentationEntry[] = sourcePaths
  .map(path => {
    const stat = statSync(path);
    return {
      path: relative(DOC_ROOT, path).replaceAll('\\', '/'),
      category: categoryFor(path),
      format: extname(path).slice(1).toLowerCase() || 'file',
      title: titleFor(path),
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  })
  .sort((a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path));

function markdownHref(path: string): string {
  // Encode path characters that can terminate or alter Markdown link destinations.
  // encodeURIComponent intentionally leaves parentheses unescaped, so handle them explicitly.
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment).replaceAll('(', '%28').replaceAll(')', '%29'))
    .join('/');
}

const categoryLabels: Record<DocCategory, string> = {
  active: 'Active documentation',
  automation: 'Automation and engine specifications',
  'generated-output': 'Generated reports and datasets',
  historical: 'Historical documentation',
  source: 'Source proposals and reports',
  visual: 'Visual and design artifacts',
  audit: 'Audit evidence',
  release: 'Release history',
};

const markdown = [
  '# APEX Documentation Index',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This file is generated from the current `Doc/` tree. Use `Doc/README.md` for the short operating guide and `Refrence.md` for agent navigation rules.',
  '',
  `Documented files: ${entries.length}`,
  '',
  ...Object.keys(categoryLabels).map(category => {
    const key = category as DocCategory;
    const rows = entries.filter(entry => entry.category === key);
    return [
      `## ${categoryLabels[key]}`,
      '',
      '| Path | Title | Format | Updated |',
      '|------|-------|--------|---------|',
      ...rows.map(entry => `| [\`${entry.path}\`](./${markdownHref(entry.path)}) | ${entry.title.replaceAll('|', '\\|')} | ${entry.format} | ${entry.updatedAt.slice(0, 10)} |`),
      '',
    ].join('\n');
  }),
].join('\n');

writeFileSync(OUT_MD, markdown, 'utf8');
writeFileSync(OUT_JSON, JSON.stringify({
  generatedAt: new Date().toISOString(),
  root: 'Doc',
  count: entries.length,
  categories: categoryLabels,
  fileHashes,
  entries,
}, null, 2), 'utf8');

console.log(`Indexed ${entries.length} documentation files.`);
console.log(`Wrote ${relative(ROOT, OUT_MD)} and ${relative(ROOT, OUT_JSON)}.`);
