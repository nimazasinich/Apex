#!/usr/bin/env node
/**
 * Apex Function Atlas
 * ===================
 * Indexes functions/methods/hooks/components across the TypeScript codebase.
 * Writes:
 *   - Doc/FUNCTION_INDEX.json + .md  (human atlas)
 *   - .agent-index/functions_index.json  (agent fast-lookup, subfinder-compatible)
 *
 * Usage:
 *   npx tsx scripts/generateFunctionIndex.mts
 *   npx tsx scripts/generateFunctionIndex.mts --watch
 *   npm run index:functions
 *   npm run index:functions:watch
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type * as TypeScript from 'typescript';
import { execFileSync } from 'node:child_process';

const requireFromHere = createRequire(import.meta.url);
function resolveTypeScript(): string {
  const local = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return local;
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return globalTs;
  } catch { /* fall through */ }
  throw new Error('typescript_runtime_unavailable');
}
const ts = requireFromHere(resolveTypeScript()) as typeof import('typescript');

type FunctionKind =
  | 'function'
  | 'arrow'
  | 'component'
  | 'method'
  | 'class'
  | 'hook'
  | 'route';

interface FunctionEntry {
  name: string;
  qualname: string;
  kind: FunctionKind;
  file: string;
  line: number;
  lineEnd: number;
  exported: boolean;
  async: boolean;
  params: string[];
  returns: string;
  tags: string[];
  signature: string;
  docstring: string;
}

/** Subfinder / agent-facing shape */
interface AgentFunctionEntry {
  name: string;
  qualname: string;
  file: string;
  line_start: number;
  line_end: number;
  signature: string;
  docstring: string;
  decorators: string[];
  is_async: boolean;
  kind: FunctionKind;
  tags: string[];
}

const ROOT = process.cwd();
const INCLUDE_ROOTS = ['server.ts', 'src', 'scripts', 'tests'];
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'dist.bak',
  'temp',
  'tmp',
  '_archive',
  '_qa',
  '.agent-index',
  '.git',
]);
const OUTPUT_JSON = path.join(ROOT, 'Doc', 'FUNCTION_INDEX.json');
const OUTPUT_MD = path.join(ROOT, 'Doc', 'FUNCTION_INDEX.md');
const AGENT_INDEX = path.join(ROOT, '.agent-index', 'functions_index.json');
const WATCH = process.argv.includes('--watch');
const IF_CHANGED = process.argv.includes('--if-changed');
const DEBOUNCE_MS = 600;

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function fileHash(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
}

function isSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|mts|mjs|js|jsx)$/.test(filePath) && !filePath.endsWith('.d.ts');
}

function walk(target: string, files: string[]): void {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return;

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (isSourceFile(absolute)) files.push(absolute);
    return;
  }

  for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (item.isDirectory() && EXCLUDED_DIRS.has(item.name)) continue;
    const next = path.join(target, item.name);
    if (item.isDirectory()) {
      walk(next, files);
    } else if (isSourceFile(next)) {
      files.push(path.join(ROOT, next));
    }
  }
}

function lineOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function endLineOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

function hasModifier(node: TypeScript.Node, kind: TypeScript.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === kind));
}

function isExported(node: TypeScript.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isAsync(node: TypeScript.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.AsyncKeyword);
}

function paramsOf(params: TypeScript.NodeArray<TypeScript.ParameterDeclaration>, sourceFile: TypeScript.SourceFile): string[] {
  return params.map((param) => param.getText(sourceFile).replace(/\s+/g, ' '));
}

function returnTypeOf(node: TypeScript.FunctionLikeDeclarationBase, sourceFile: TypeScript.SourceFile): string {
  if (node.type) return node.type.getText(sourceFile).replace(/\s+/g, ' ');
  return 'inferred';
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0].trim().replace(/\s+/g, ' ');
}

function jsDocOf(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): string {
  const ranges = ts.getJSDocCommentsAndTags(node);
  if (!ranges.length) return '';
  const text = ranges
    .map((r) => r.getText(sourceFile))
    .join('\n')
    .replace(/\/\*\*|\*\//g, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
  return text.slice(0, 300);
}

function tagsFor(file: string, name: string, kind: FunctionKind): string[] {
  const tags = new Set<string>();
  const parts = file.split('/');

  if (file === 'server.ts') tags.add('server');
  if (parts.includes('components')) tags.add('ui');
  if (parts.includes('hooks')) tags.add('hook');
  if (parts.includes('services')) tags.add('service');
  if (parts.includes('providers')) tags.add('provider');
  if (parts.includes('tests')) tags.add('test');
  if (parts[0] === 'scripts') tags.add('script');
  if (parts.includes('subfinder')) tags.add('subfinder');
  if (/scanner/i.test(file + name)) tags.add('scanner');
  if (/decision|memory/i.test(file + name)) tags.add('decision-memory');
  if (/adaptive|threshold/i.test(file + name)) tags.add('adaptive');
  if (/market|provider|exchange|proxy|kucoin|binance/i.test(file + name)) tags.add('market-data');
  if (/ml|feature|dataset|model/i.test(file + name)) tags.add('ml');
  if (kind === 'component') tags.add('component');
  if (kind === 'hook') tags.add('hook');
  if (kind === 'route') tags.add('api-route');

  return [...tags].sort();
}

function inferKind(name: string, file: string, nodeKind: FunctionKind, bodyText = ''): FunctionKind {
  if (nodeKind === 'method' || nodeKind === 'class') return nodeKind;
  if (/^use[A-Z]/.test(name)) return 'hook';
  if (/\.tsx$/.test(file) && /^[A-Z]/.test(name)) return 'component';
  if (/app\.(get|post|put|patch|delete)\s*\(/.test(bodyText)) return 'route';
  return nodeKind;
}

function addEntry(
  entries: FunctionEntry[],
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.FunctionLikeDeclarationBase,
  name: string,
  qualname: string,
  file: string,
  kind: FunctionKind,
  exported: boolean,
): void {
  const bodyText = node.getText(sourceFile);
  const inferredKind = inferKind(name, file, kind, bodyText);
  entries.push({
    name,
    qualname,
    kind: inferredKind,
    file,
    line: lineOf(sourceFile, node),
    lineEnd: endLineOf(sourceFile, node),
    exported,
    async: isAsync(node),
    params: paramsOf(node.parameters, sourceFile),
    returns: returnTypeOf(node, sourceFile),
    tags: tagsFor(file, name, inferredKind),
    signature: firstLine(bodyText),
    docstring: jsDocOf(node, sourceFile),
  });
}

function collectFromFile(filePath: string): FunctionEntry[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const relativeFile = toPosix(path.relative(ROOT, filePath));
  const entries: FunctionEntry[] = [];
  const classStack: string[] = [];

  const visit = (node: TypeScript.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addEntry(
        entries,
        sourceFile,
        node,
        node.name.text,
        node.name.text,
        relativeFile,
        'function',
        isExported(node),
      );
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text;
      entries.push({
        name: className,
        qualname: className,
        kind: 'class',
        file: relativeFile,
        line: lineOf(sourceFile, node),
        lineEnd: endLineOf(sourceFile, node),
        exported: isExported(node),
        async: false,
        params: [],
        returns: className,
        tags: tagsFor(relativeFile, className, 'class'),
        signature: firstLine(node.getText(sourceFile)),
        docstring: jsDocOf(node, sourceFile),
      });
      classStack.push(className);
      ts.forEachChild(node, visit);
      classStack.pop();
      return;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const methodName = node.name.text;
      const qualname = [...classStack, methodName].join('.');
      addEntry(entries, sourceFile, node, methodName, qualname, relativeFile, 'method', false);
    }

    if (ts.isVariableStatement(node)) {
      const exported = isExported(node);
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        if (!initializer) continue;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          const name = declaration.name.text;
          addEntry(entries, sourceFile, initializer, name, name, relativeFile, 'arrow', exported);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return entries;
}

function byFileThenLine(a: FunctionEntry, b: FunctionEntry): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name);
}

function toAgentEntry(entry: FunctionEntry): AgentFunctionEntry {
  return {
    name: entry.name,
    qualname: entry.qualname,
    file: entry.file,
    line_start: entry.line,
    line_end: entry.lineEnd,
    signature: entry.signature,
    docstring: entry.docstring,
    decorators: [],
    is_async: entry.async,
    kind: entry.kind,
    tags: entry.tags,
  };
}

function renderMarkdown(entries: FunctionEntry[]): string {
  const grouped = new Map<string, FunctionEntry[]>();
  for (const entry of entries) {
    const current = grouped.get(entry.file) ?? [];
    current.push(entry);
    grouped.set(entry.file, current);
  }

  const lines = [
    '# APEX Function Atlas',
    '',
    'Generated by `npm run index:functions`.',
    '',
    'Use this index before opening large files. Search by function name, tag, or file path, then open only the referenced line range.',
    '',
    '## Agent Workflow',
    '',
    '1. Prefer `npm run index:functions:query -- <name_or_regex>` or `.agent-index/functions_index.json`.',
    '2. Or search `Doc/FUNCTION_INDEX.md` / `Doc/FUNCTION_INDEX.json`.',
    '3. Open the target file near the listed line.',
    '4. Keep the index fresh with `npm run index:functions` or `npm run index:functions:watch`.',
    '',
    '## Summary',
    '',
    `- Total indexed symbols: ${entries.length}`,
    `- Generated at: ${new Date().toISOString()}`,
    '',
    '## Tag Index',
    '',
  ];

  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  for (const [tag, count] of [...tagCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- \`${tag}\`: ${count}`);
  }

  lines.push('', '## Functions By File', '');

  for (const [file, fileEntries] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`### ${file}`, '');
    lines.push('| Name | Kind | Line | Export | Async | Tags |');
    lines.push('|---|---|---:|---|---|---|');
    for (const entry of fileEntries.sort((a, b) => a.line - b.line)) {
      lines.push(
        `| \`${entry.qualname}\` | ${entry.kind} | ${entry.line}-${entry.lineEnd} | ${entry.exported ? 'yes' : 'no'} | ${entry.async ? 'yes' : 'no'} | ${entry.tags.map((t) => `\`${t}\``).join(', ')} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function loadPreviousAgentIndex(): {
  file_hashes?: Record<string, string>;
  functions?: AgentFunctionEntry[];
  total_functions?: number;
} | null {
  try {
    if (fs.existsSync(AGENT_INDEX)) {
      return JSON.parse(fs.readFileSync(AGENT_INDEX, 'utf8'));
    }
  } catch {
    // Fall through to the tracked documentation index below.
  }

  try {
    if (!fs.existsSync(OUTPUT_JSON)) return null;
    const tracked = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8')) as {
      fileHashes?: Record<string, string>;
      entries?: FunctionEntry[];
    };
    return {
      file_hashes: tracked.fileHashes,
      functions: tracked.entries?.map(toAgentEntry),
      total_functions: tracked.entries?.length,
    };
  } catch {
    return null;
  }
}

function hashesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function reportDelta(prev: AgentFunctionEntry[] | undefined, next: FunctionEntry[]): void {
  if (!prev) return;
  const prevNames = new Set(prev.map((f) => `${f.file}::${f.qualname}`));
  const nextNames = new Set(next.map((f) => `${f.file}::${f.qualname}`));
  const added = [...nextNames].filter((k) => !prevNames.has(k));
  const removed = [...prevNames].filter((k) => !nextNames.has(k));
  if (added.length) {
    console.log(`  + ${added.length} new symbol(s):`);
    for (const key of added.slice(0, 12)) console.log(`      ${key}`);
    if (added.length > 12) console.log(`      … ${added.length - 12} more`);
  }
  if (removed.length) {
    console.log(`  - ${removed.length} removed symbol(s)`);
  }
  if (!added.length && !removed.length) {
    console.log('  Symbols unchanged (file content hash differed; signatures/lines refreshed).');
  }
}

function collectCurrentHashes(): Record<string, string> {
  const files: string[] = [];
  for (const root of INCLUDE_ROOTS) walk(root, files);
  const fileHashes: Record<string, string> = {};
  for (const filePath of files) {
    fileHashes[toPosix(path.relative(ROOT, filePath))] = fileHash(filePath);
  }
  return fileHashes;
}

function buildIndex(): { entries: FunctionEntry[]; fileCount: number; fileHashes: Record<string, string> } {
  const files: string[] = [];
  for (const root of INCLUDE_ROOTS) walk(root, files);

  const entries = files.flatMap(collectFromFile).sort(byFileThenLine);
  const fileHashes: Record<string, string> = {};
  for (const filePath of files) {
    fileHashes[toPosix(path.relative(ROOT, filePath))] = fileHash(filePath);
  }

  const generatedAt = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(AGENT_INDEX), { recursive: true });

  fs.writeFileSync(
    OUTPUT_JSON,
    `${JSON.stringify({ generatedAt, process: 'Apex Function Atlas', fileHashes, entries }, null, 2)}\n`,
  );
  fs.writeFileSync(OUTPUT_MD, renderMarkdown(entries));

  const agentPayload = {
    generated_at: generatedAt,
    root: ROOT,
    total_functions: entries.length,
    file_hashes: fileHashes,
    functions: entries.map(toAgentEntry),
  };
  fs.writeFileSync(AGENT_INDEX, `${JSON.stringify(agentPayload, null, 2)}\n`, 'utf8');

  return { entries, fileCount: files.length, fileHashes };
}

function runOnce(label = 'Indexed', opts?: { force?: boolean }): boolean {
  const previous = loadPreviousAgentIndex();
  const currentHashes = collectCurrentHashes();

  if (IF_CHANGED && !opts?.force && previous?.file_hashes && hashesEqual(previous.file_hashes, currentHashes)) {
    console.log(`${label} up to date (${previous.total_functions ?? 0} symbols) — no source hash changes.`);
    return false;
  }

  const { entries, fileCount } = buildIndex();
  console.log(`${label} ${entries.length} symbols across ${fileCount} files.`);
  reportDelta(previous?.functions, entries);
  console.log(`  Doc:         ${toPosix(path.relative(ROOT, OUTPUT_MD))}`);
  console.log(`  Doc JSON:    ${toPosix(path.relative(ROOT, OUTPUT_JSON))}`);
  console.log(`  Agent index: ${toPosix(path.relative(ROOT, AGENT_INDEX))}`);
  return true;
}

function watchSources(): void {
  runOnce('Initial index:', { force: true });
  console.log('');
  console.log('Auto-index active: watching server.ts / src / scripts / tests');
  console.log('When a file changes, hashes are compared — new or updated functions are indexed.');
  console.log('(Ctrl+C to stop)');
  console.log('');

  let timer: NodeJS.Timeout | null = null;
  const schedule = (reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const previous = loadPreviousAgentIndex();
        const currentHashes = collectCurrentHashes();
        if (previous?.file_hashes && hashesEqual(previous.file_hashes, currentHashes)) {
          console.log(`[watch] ${reason}: no hash change — skip`);
          return;
        }
        runOnce(`Rebuilt (${reason}):`, { force: true });
      } catch (err) {
        console.error('Index rebuild failed:', err);
      }
    }, DEBOUNCE_MS);
  };

  for (const root of INCLUDE_ROOTS) {
    const absolute = path.join(ROOT, root);
    if (!fs.existsSync(absolute)) continue;
    try {
      fs.watch(absolute, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const name = String(filename).replace(/\\/g, '/');
        if (!/\.(ts|tsx|mts|mjs|js|jsx)$/.test(name) || name.endsWith('.d.ts')) return;
        if ([...EXCLUDED_DIRS].some((d) => name.includes(`/${d}/`) || name.startsWith(`${d}/`))) return;
        schedule(name);
      });
    } catch (err) {
      console.warn(`Could not watch ${root}:`, err);
    }
  }
}

if (WATCH) {
  watchSources();
} else {
  runOnce(IF_CHANGED ? 'Checked:' : 'Indexed:', { force: !IF_CHANGED });
}
