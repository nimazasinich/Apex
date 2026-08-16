/**
 * QA artifact retention and cleanup — operates ONLY inside project `_qa/`.
 * Usage:
 *   tsx scripts/qa/cleanupQaArtifacts.mts [--dry-run]
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const QA_DIR_NAME = '_qa';
const WARNING_BYTES = Number(process.env.QA_SIZE_WARN_BYTES ?? 1_073_741_824); // 1 GB
const CLEANUP_BYTES = Number(process.env.QA_SIZE_CLEANUP_BYTES ?? 2_147_483_648); // 2 GB
const DIAG_RETAIN_COUNT = 3;
const DIAG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DOC_PATHS = [
  resolve(root, 'Doc/reports/final/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md'),
  resolve(root, 'Doc/repository/ROOT_CLEANUP_REPORT.md'),
];

type Category =
  | 'final_acceptance'
  | 'contact_sheet'
  | 'split_dock'
  | 'a11y'
  | 'empty_states'
  | 'phase_gate'
  | 'step1'
  | 'phase0'
  | 'diagnostic';

export type CleanupResult = {
  qaDir: string;
  dryRun: boolean;
  sizeBefore: number;
  sizeAfter: number;
  protected: string[];
  removed: string[];
  skipped: string[];
  warnings: string[];
};

type FolderEntry = {
  name: string;
  abs: string;
  category: Category;
  sortKey: number;
  mtimeMs: number;
  successful: boolean;
};

function fail(msg: string): never {
  console.error(`[qa:cleanup] FATAL: ${msg}`);
  process.exit(1);
}

function resolveQaDir(explicit?: string): string {
  const qaDir = resolve(explicit ?? join(root, QA_DIR_NAME));
  if (!qaDir || qaDir === root || qaDir === dirname(root)) {
    fail('Refusing empty, root, or parent target path.');
  }
  const normalizedRoot = resolve(root);
  const rel = relative(normalizedRoot, qaDir);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    fail(`Target "${qaDir}" resolves outside project root.`);
  }
  if (!rel.split(sep).includes(QA_DIR_NAME) && !qaDir.endsWith(QA_DIR_NAME)) {
    fail(`Target must be the project _qa directory, got: ${qaDir}`);
  }
  if (!existsSync(qaDir)) {
    fail(`_qa directory does not exist: ${qaDir}`);
  }
  const st = statSync(qaDir);
  if (!st.isDirectory()) {
    fail(`Target is not a directory: ${qaDir}`);
  }
  return qaDir;
}

function safeUnderQa(qaDir: string, target: string): string {
  const abs = resolve(target);
  const rel = relative(qaDir, abs);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel === '') {
    fail(`Refusing deletion outside _qa: ${target}`);
  }
  return abs;
}

function parseSortKey(name: string): number {
  const iso = name.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
  if (iso) {
    const [date, time] = iso[1].split('_');
    return Date.parse(`${date}T${time.replace(/-/g, ':')}`);
  }
  const compact = name.match(/(\d{8})_(\d{6})/);
  if (compact) {
    const d = compact[1];
    const t = compact[2];
    return Date.parse(
      `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`,
    );
  }
  return 0;
}

function categorize(name: string): Category {
  if (name.startsWith('v3_final_acceptance_')) return 'final_acceptance';
  if (name.startsWith('split_dock_headed_')) return 'split_dock';
  if (name.startsWith('a11y_smoke_')) return 'a11y';
  if (name.startsWith('empty_states_')) return 'empty_states';
  if (name.startsWith('v3_phase_gate_')) return 'phase_gate';
  if (name.startsWith('step1_verify_')) return 'step1';
  if (name.startsWith('phase0_')) return 'phase0';
  if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name)) return 'contact_sheet';
  return 'diagnostic';
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function isSuccessfulFolder(entry: FolderEntry): boolean {
  const { abs, category, name } = entry;
  if (category === 'contact_sheet') {
    return existsSync(join(abs, 'visual-unification', 'contact-sheet-manifest.json'));
  }
  if (category === 'final_acceptance') {
    const report = readJson(join(abs, 'reports', 'final_acceptance_report.json')) as
      | { applicationErrors?: unknown[]; captures?: unknown[] }
      | null;
    if (!report) return false;
    const appErr = Array.isArray(report.applicationErrors) ? report.applicationErrors.length : 0;
    const caps = Array.isArray(report.captures) ? report.captures.length : 0;
    return appErr === 0 && caps > 0;
  }
  if (category === 'split_dock') {
    const report = readJson(join(abs, 'reports', 'split_dock_report.json')) as
      | { failures?: unknown[] }
      | null;
    return !!report && (!Array.isArray(report.failures) || report.failures.length === 0);
  }
  if (category === 'a11y') {
    const report = readJson(join(abs, 'a11y_report.json')) as { failures?: unknown[] } | null;
    return !!report && (!Array.isArray(report.failures) || report.failures.length === 0);
  }
  if (category === 'empty_states') {
    const report = readJson(join(abs, 'reports', 'empty_states_report.json')) as
      | { applicationErrors?: unknown[]; captures?: { accepted?: boolean }[] }
      | null;
    if (!report) return false;
    const appErr = Array.isArray(report.applicationErrors) ? report.applicationErrors.length : 0;
    const caps = Array.isArray(report.captures) ? report.captures : [];
    return appErr === 0 && caps.length > 0 && caps.every((c) => c.accepted !== false);
  }
  if (category === 'phase_gate') {
    return existsSync(join(abs, 'reports', 'phase_gate_report.json'));
  }
  if (category === 'step1') {
    return existsSync(join(abs, 'reports', 'step1_report.json'));
  }
  return existsSync(abs);
}

function collectDocProtectedFolderNames(): Set<string> {
  const protectedNames = new Set<string>();
  const re = /`_qa\/([^`\s*)]+)`|_qa\/([^\s"'`*)]+)/g;
  for (const doc of DOC_PATHS) {
    if (!existsSync(doc)) continue;
    const text = readFileSync(doc, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = (m[1] ?? m[2] ?? '').replace(/\\/g, '/');
      const top = raw.split('/')[0]?.replace(/\*$/, '');
      if (top && top !== '*') protectedNames.add(top);
    }
  }
  return protectedNames;
}

function dirSize(abs: string): number {
  let total = 0;
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop()!;
    let st;
    try {
      st = statSync(cur);
    } catch {
      continue;
    }
    if (st.isFile()) {
      total += st.size;
      continue;
    }
    if (st.isDirectory()) {
      for (const child of readdirSync(cur)) stack.push(join(cur, child));
    }
  }
  return total;
}

function listTopLevel(qaDir: string): FolderEntry[] {
  return readdirSync(qaDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const abs = join(qaDir, d.name);
      const st = statSync(abs);
      const sortKey = parseSortKey(d.name) || st.mtimeMs;
      return {
        name: d.name,
        abs,
        category: categorize(d.name),
        sortKey,
        mtimeMs: st.mtimeMs,
        successful: false,
      };
    });
}

function pickNewestSuccessful(entries: FolderEntry[]): FolderEntry | null {
  const ok = entries.filter((e) => e.successful).sort((a, b) => b.sortKey - a.sortKey);
  return ok[0] ?? null;
}

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

export function runQaCleanup(opts: { dryRun?: boolean; qaDir?: string } = {}): CleanupResult {
  const dryRun = opts.dryRun ?? false;
  const qaDir = resolveQaDir(opts.qaDir);
  const sizeBefore = dirSize(qaDir);
  const warnings: string[] = [];

  const entries = listTopLevel(qaDir).map((e) => ({ ...e, successful: isSuccessfulFolder(e) }));
  const docProtected = collectDocProtectedFolderNames();

  const requiredCategories: Category[] = [
    'final_acceptance',
    'contact_sheet',
    'split_dock',
    'a11y',
    'empty_states',
  ];

  const protectedNames = new Set<string>(docProtected);

  for (const cat of requiredCategories) {
    const newest = pickNewestSuccessful(entries.filter((e) => e.category === cat));
    if (newest) protectedNames.add(newest.name);
  }

  // Wildcard doc reference: a11y_smoke_* → protect latest successful a11y if referenced
  if ([...docProtected].some((n) => n.startsWith('a11y_smoke'))) {
    const newestA11y = pickNewestSuccessful(entries.filter((e) => e.category === 'a11y'));
    if (newestA11y) protectedNames.add(newestA11y.name);
  }

  const now = Date.now();
  const byCategory = new Map<Category, FolderEntry[]>();
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push(e);
  }

  const diagnosticCats: Category[] = ['phase_gate', 'step1', 'phase0', 'diagnostic'];
  for (const cat of diagnosticCats) {
    const list = (byCategory.get(cat) ?? []).sort((a, b) => b.sortKey - a.sortKey);
    list.slice(0, DIAG_RETAIN_COUNT).forEach((e) => protectedNames.add(e.name));
  }

  const toRemove: FolderEntry[] = [];
  const skipped: string[] = [];

  for (const e of entries) {
    if (protectedNames.has(e.name)) continue;

    const age = now - (e.sortKey || e.mtimeMs);
    const isDiag = diagnosticCats.includes(e.category);

    if (!e.successful) {
      // Keep recent failed runs for diagnosis
      if (age < DIAG_MAX_AGE_MS) {
        skipped.push(`${e.name} (failed, recent)`);
        continue;
      }
      toRemove.push(e);
      continue;
    }

    if (isDiag && age > DIAG_MAX_AGE_MS) {
      toRemove.push(e);
      continue;
    }

    if (!isDiag && requiredCategories.includes(e.category)) {
      // Superseded successful required-category run
      toRemove.push(e);
      continue;
    }

    if (isDiag) {
      const list = (byCategory.get(e.category) ?? []).sort((a, b) => b.sortKey - a.sortKey);
      const idx = list.findIndex((x) => x.name === e.name);
      if (idx >= DIAG_RETAIN_COUNT) toRemove.push(e);
      else skipped.push(`${e.name} (diagnostic retain)`);
      continue;
    }

    toRemove.push(e);
  }

  if (sizeBefore >= WARNING_BYTES) {
    const sized = entries
      .map((e) => ({ name: e.name, bytes: dirSize(e.abs), protected: protectedNames.has(e.name) }))
      .sort((a, b) => b.bytes - a.bytes);
    warnings.push(
      `_qa size ${formatBytes(sizeBefore)} exceeds warning threshold ${formatBytes(WARNING_BYTES)}`,
    );
    console.log('[qa:cleanup] Size report:');
    console.log(`  total: ${formatBytes(sizeBefore)}`);
    console.log('  largest folders:');
    for (const s of sized.slice(0, 8)) {
      console.log(
        `    - ${s.name}: ${formatBytes(s.bytes)}${s.protected ? ' [PROTECTED]' : ' [removable if eligible]'}`,
      );
    }
    console.log('  protected folders:');
    for (const name of [...protectedNames].sort()) {
      console.log(`    - ${name}`);
    }
  }

  const removed: string[] = [];
  console.log(`[qa:cleanup] mode=${dryRun ? 'DRY-RUN' : 'DELETE'} qaDir=${qaDir}`);
  console.log(`[qa:cleanup] protected (${protectedNames.size}): ${[...protectedNames].sort().join(', ')}`);

  for (const e of toRemove) {
    safeUnderQa(qaDir, e.abs);
    console.log(`[qa:cleanup] ${dryRun ? 'would delete' : 'deleting'}: ${e.name}/ (${e.category})`);
    if (!dryRun) {
      rmSync(e.abs, { recursive: true, force: true });
    }
    removed.push(e.name);
  }

  const sizeAfter = dryRun ? sizeBefore - toRemove.reduce((s, e) => s + dirSize(e.abs), 0) : dirSize(qaDir);

  if (sizeBefore >= CLEANUP_BYTES && removed.length === 0 && !dryRun) {
    warnings.push(
      `_qa exceeds cleanup threshold ${formatBytes(CLEANUP_BYTES)} but no eligible superseded artifacts were removed (protected evidence preserved).`,
    );
  }

  const result: CleanupResult = {
    qaDir,
    dryRun,
    sizeBefore,
    sizeAfter: dryRun ? sizeAfter : dirSize(qaDir),
    protected: [...protectedNames].sort(),
    removed,
    skipped,
    warnings,
  };

  const summaryPath = join(qaDir, 'cleanup-last-run.json');
  if (!dryRun) {
    writeFileSync(summaryPath, JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2));
  }

  console.log(
    `[qa:cleanup] done removed=${removed.length} protected=${protectedNames.size} size ${formatBytes(result.sizeBefore)} → ${formatBytes(result.sizeAfter)}`,
  );

  return result;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const dryRun = process.argv.includes('--dry-run');
  runQaCleanup({ dryRun });
}
