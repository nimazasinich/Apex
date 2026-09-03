#!/usr/bin/env node
/**
 * Query Function Index
 * ====================
 * Fast lookup by name or regex against the Apex function atlas —
 * without grepping the whole repo.
 *
 * Usage:
 *   npx tsx scripts/queryFunctionIndex.mts <name_or_pattern>
 *   npm run index:functions:query -- ClankAppProvider
 *   npm run index:functions:query -- "^fetch.*Market"
 *
 * Prefers .agent-index/functions_index.json; falls back to Doc/FUNCTION_INDEX.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AGENT_INDEX = path.join(ROOT, '.agent-index', 'functions_index.json');
const DOC_INDEX = path.join(ROOT, 'Doc', 'FUNCTION_INDEX.json');

type AgentFn = {
  name: string;
  qualname: string;
  file: string;
  line_start: number;
  line_end: number;
  signature?: string;
  docstring?: string;
  kind?: string;
  tags?: string[];
};

type FileUsageEntry = {
  file: string;
  importedBy?: string[];
  typeImportedBy?: string[];
  sourceContractReferencedBy?: string[];
  rootKinds?: string[];
  productionReachable?: boolean;
  productionTypeReachable?: boolean;
  testToolReachable?: boolean;
  sourceContractReachable?: boolean;
  usageStatus?: string;
};

type DocFn = {
  name: string;
  qualname?: string;
  file: string;
  line: number;
  lineEnd?: number;
  signature?: string;
  docstring?: string;
  kind?: string;
  tags?: string[];
};

function loadEntries(): AgentFn[] {
  if (fs.existsSync(AGENT_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(AGENT_INDEX, 'utf8'));
    if (Array.isArray(raw.functions)) return raw.functions as AgentFn[];
  }
  if (fs.existsSync(DOC_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(DOC_INDEX, 'utf8'));
    const entries = (raw.entries ?? []) as DocFn[];
    return entries.map((e) => ({
      name: e.name,
      qualname: e.qualname || e.name,
      file: e.file,
      line_start: e.line,
      line_end: e.lineEnd ?? e.line,
      signature: e.signature,
      docstring: e.docstring,
      kind: e.kind,
      tags: e.tags,
    }));
  }
  return [];
}


function loadFileUsage(): Record<string, FileUsageEntry> {
  for (const indexPath of [AGENT_INDEX, DOC_INDEX]) {
    if (!fs.existsSync(indexPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const usage = raw.file_usage ?? raw.fileUsage;
      if (usage && typeof usage === 'object') return usage as Record<string, FileUsageEntry>;
    } catch {
      // Try the next index source.
    }
  }
  return {};
}

function printUnused(): void {
  const usage = loadFileUsage();
  const candidates = Object.values(usage)
    .filter((entry) => entry.usageStatus === 'unreferenced-static')
    .sort((a, b) => a.file.localeCompare(b.file));
  const sourceContracts = Object.values(usage).filter((entry) => entry.usageStatus === 'source-contract-only');
  if (!Object.keys(usage).length) {
    console.error('File-usage graph not found. Run: npm run index:functions');
    process.exit(1);
  }
  console.log(`Static orphan candidates: ${candidates.length} (source-contract-only retained: ${sourceContracts.length})\n`);
  for (const entry of candidates) {
    console.log(`${entry.file}`);
    console.log(`  importedBy=${entry.importedBy?.length ?? 0} typeImportedBy=${entry.typeImportedBy?.length ?? 0}`);
  }
  console.log('\nNote: source-contract-only files are intentionally excluded; inspect dynamic/path-computed consumers before deletion.');
}

function printFileUsage(file: string): void {
  const usage = loadFileUsage();
  const normalized = file.replaceAll('\\', '/').replace(/^\.\//, '');
  const entry = usage[normalized];
  if (!entry) {
    console.error(`No usage record for: ${normalized}. Run: npm run index:functions`);
    process.exit(1);
  }
  console.log(JSON.stringify(entry, null, 2));
}

function main(): void {
  const pattern = process.argv[2];
  if (pattern === '--unused') {
    printUnused();
    return;
  }
  if (pattern === '--file') {
    const file = process.argv[3];
    if (!file) {
      console.error('Usage: queryFunctionIndex.mts --file <repo-relative-path>');
      process.exit(1);
    }
    printFileUsage(file);
    return;
  }
  if (!pattern) {
    console.error('Usage: npx tsx scripts/queryFunctionIndex.mts <name_or_pattern> | --unused | --file <path>');
    console.error('Hint: run `npm run index:functions` first if the index is missing.');
    process.exit(1);
  }

  const entries = loadEntries();
  if (!entries.length) {
    console.error('Index not found. Run: npm run index:functions');
    process.exit(1);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    console.error(`Invalid regex pattern: ${pattern}`);
    process.exit(1);
  }

  const matches = entries.filter(
    (fn) =>
      regex.test(fn.name) ||
      regex.test(fn.qualname) ||
      (fn.tags ?? []).some((t) => regex.test(t)) ||
      regex.test(fn.file),
  );

  if (!matches.length) {
    console.log(`No functions matching '${pattern}' found.`);
    return;
  }

  console.log(`Found ${matches.length} match(es) for /${pattern}/i\n`);
  for (const fn of matches.slice(0, 80)) {
    const location = `${fn.file}:${fn.line_start}-${fn.line_end}`;
    const kind = fn.kind ? ` [${fn.kind}]` : '';
    console.log(`${fn.qualname}${kind}  ->  ${location}`);
    if (fn.signature) console.log(`  ${fn.signature}`);
    if (fn.docstring) console.log(`  "${fn.docstring.slice(0, 120)}"`);
    if (fn.tags?.length) console.log(`  tags: ${fn.tags.join(', ')}`);
    console.log('');
  }
  if (matches.length > 80) {
    console.log(`… ${matches.length - 80} more (narrow the pattern)`);
  }
}

main();
