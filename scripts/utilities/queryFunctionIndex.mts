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

function main(): void {
  const pattern = process.argv[2];
  if (!pattern) {
    console.error('Usage: npx tsx scripts/queryFunctionIndex.mts <name_or_pattern>');
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
