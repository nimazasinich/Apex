#!/usr/bin/env node
/**
 * APEX App Index / Code Cartography
 * =================================
 * Repository-wide architecture map built on top of the canonical Function Atlas.
 *
 * Key invariant: an import edge does NOT imply a file is live. Liveness is proven
 * by transitive reachability from explicit production/test/tool roots. Unreachable
 * files that import one another are grouped into dead islands.
 *
 * Outputs:
 *   APP_INDEX/APP_MAP.json       machine-readable current snapshot
 *   APP_INDEX/APP_MAP.md         human summary
 *   APP_INDEX/TREE.md            complete repository tree
 *   APP_INDEX/app-index.sqlite   historical snapshots, paths, moves, deps, symbols
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createRepositoryResolver, parseFileDependencies } from './app-index/resolver.mjs';
import { detectFileLineage } from './app-index/lineage.mjs';

const ROOT = process.cwd();
const requireFromHere = createRequire(import.meta.url);
const OUT_DIR = path.join(ROOT, 'APP_INDEX');
const MAP_JSON = path.join(OUT_DIR, 'APP_MAP.json');
const MAP_MD = path.join(OUT_DIR, 'APP_MAP.md');
const TREE_MD = path.join(OUT_DIR, 'TREE.md');
const GRAPH_DOT = path.join(OUT_DIR, 'APP_GRAPH.dot');
const LAYER_MMD = path.join(OUT_DIR, 'LAYER_GRAPH.mmd');
const DB_PATH = path.join(OUT_DIR, 'app-index.sqlite');
const LAYERS_PATH = path.join(OUT_DIR, 'layers.json');
const ATLAS_PATH = path.join(ROOT, 'Doc', 'FUNCTION_INDEX.json');
const CHECK_ONLY = process.argv.includes('--check');
const FORCE_SNAPSHOT = process.argv.includes('--force-snapshot');

const CODE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.jsx', '.cjs']);
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.cjs', '.json', '.md', '.txt', '.css', '.html', '.yml', '.yaml', '.xml', '.svg', '.py', '.ps1', '.bat', '.cmd', '.sh', '.toml', '.ini', '.env', '.example', '.sql'
]);
const RESOLVE_EXTS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.cjs', '.json', '.css', '.svg'];
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'dist.bak', '.git', '.agent-index', '.apex-data', '.apex-private-data', '.claude',
  '.mcp-recovered', '.playwright-browsers', '.serena', '.qa-tmp', 'temp', 'tmp', '_archive', '_qa', '_release',
  'QA', 'test-results', 'coverage', '.cache'
]);
const SNAPSHOT_TRIGGER_EXCLUDED = new Set([
  'Doc/FUNCTION_INDEX.json', 'Doc/FUNCTION_INDEX.md',
  'Doc/DOCUMENTATION_INDEX.json', 'Doc/DOCUMENTATION_INDEX.md',
  'Doc/repository/API_ROUTE_INDEX_2026-08-10.json', 'Doc/repository/API_ROUTE_INDEX_2026-08-10.md',
  'public/build-info.json',
]);
const GENERATED_INDEX_FILES = new Set([
  'APP_INDEX/APP_MAP.json', 'APP_INDEX/APP_MAP.md', 'APP_INDEX/TREE.md', 'APP_INDEX/APP_GRAPH.dot', 'APP_INDEX/LAYER_GRAPH.mmd', 'APP_INDEX/app-index.sqlite',
  'APP_INDEX/app-index.sqlite-shm', 'APP_INDEX/app-index.sqlite-wal'
]);

function resolveTypeScript() {
  const local = path.join(ROOT, 'node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return local;
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return globalTs;
  } catch {}
  throw new Error('typescript_runtime_unavailable');
}
const ts = requireFromHere(resolveTypeScript());

function posix(p) { return p.split(path.sep).join('/'); }
function rel(abs) { return posix(path.relative(ROOT, abs)); }
function sha256Buffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sha256Text(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function isCode(file) { return CODE_EXTS.has(path.extname(file).toLowerCase()); }
function isText(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  const base = path.basename(file);
  return ['VERSION', '.gitignore', '.gitattributes', '.nvmrc', '.node-version'].includes(base) || base.startsWith('.env');
}

function walkRepo() {
  const files = [];
  const dirs = new Set(['.']);
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      const abs = path.join(dir, ent.name);
      const r = rel(abs);
      if (ent.isDirectory()) {
        if (EXCLUDED_DIRS.has(ent.name)) continue;
        dirs.add(r);
        walk(abs);
      } else if (ent.isFile()) {
        if (GENERATED_INDEX_FILES.has(r)) continue;
        files.push(abs);
        let parent = path.posix.dirname(r);
        while (parent && parent !== '.') { dirs.add(parent); parent = path.posix.dirname(parent); }
      }
    }
  };
  walk(ROOT);
  return { files: files.sort((a,b) => rel(a).localeCompare(rel(b))), dirs: [...dirs].sort() };
}

function loadLayers() {
  const raw = JSON.parse(fs.readFileSync(LAYERS_PATH, 'utf8'));
  return {
    fallback: raw.fallback || 'repository/other',
    rules: (raw.rules || []).map((r) => ({ ...r, regex: new RegExp(r.pattern) })),
  };
}
function inferLayer(file, layers) {
  return layers.rules.find((r) => r.regex.test(file))?.layer || layers.fallback;
}

function loadAtlas() {
  if (!fs.existsSync(ATLAS_PATH)) throw new Error('Function Atlas missing. Run `npm run index:functions` first.');
  const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8'));
  return atlas;
}

function packageScriptRoots(allFiles) {
  const roots = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const [name, command] of Object.entries(pkg.scripts || {})) {
      for (const match of String(command).matchAll(/(?:^|\s)((?:scripts|tests|src)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mts|mjs|js|jsx|cjs))(?=\s|$)/g)) {
        if (allFiles.has(match[1])) roots.add(match[1]);
      }
    }
  } catch {}
  return roots;
}

function bfsProof(roots, adjacency) {
  const reached = new Set();
  const parent = new Map();
  const rootOf = new Map();
  const queue = [];
  for (const root of roots) {
    if (!adjacency.has(root)) continue;
    reached.add(root); rootOf.set(root, root); queue.push(root);
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const next of adjacency.get(cur) || []) {
      if (reached.has(next)) continue;
      reached.add(next); parent.set(next, cur); rootOf.set(next, rootOf.get(cur)); queue.push(next);
    }
  }
  const proofFor = (file) => {
    if (!reached.has(file)) return [];
    const out = [file];
    let cur = file;
    while (parent.has(cur)) { cur = parent.get(cur); out.push(cur); }
    return out.reverse();
  };
  return { reached, proofFor, rootOf };
}

function tarjan(nodes, adjacency) {
  let index = 0;
  const stack = [], onStack = new Set(), indices = new Map(), low = new Map(), components = [];
  const strong = (v) => {
    indices.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of adjacency.get(v) || []) {
      if (!nodes.has(w)) continue;
      if (!indices.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), indices.get(w)));
    }
    if (low.get(v) === indices.get(v)) {
      const c = []; let w;
      do { w = stack.pop(); onStack.delete(w); c.push(w); } while (w !== v);
      components.push(c.sort());
    }
  };
  for (const n of nodes) if (!indices.has(n)) strong(n);
  return components;
}

function weakComponents(nodes, adjacency, reverse) {
  const seen = new Set(), comps = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const q = [start], c = []; seen.add(start);
    while (q.length) {
      const cur = q.shift(); c.push(cur);
      const neighbors = new Set([...(adjacency.get(cur) || []), ...(reverse.get(cur) || [])]);
      for (const next of neighbors) if (nodes.has(next) && !seen.has(next)) { seen.add(next); q.push(next); }
    }
    comps.push(c.sort());
  }
  return comps.sort((a,b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function lineSimilarity(a, b) {
  const norm = (txt) => txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const A = norm(a), B = norm(b);
  if (!A.length && !B.length) return 1;
  const count = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x)||0)+1); return m; };
  const ca = count(A), cb = count(B); let common = 0;
  for (const [line, n] of ca) common += Math.min(n, cb.get(line)||0);
  return (2 * common) / Math.max(1, A.length + B.length);
}

function makeLineSketch(text) {
  if (text === null || text === undefined) return null;
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5000)
    .map((line) => sha256Text(line).slice(0, 16));
}

function initDb(db) {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      root_hash TEXT NOT NULL,
      git_commit TEXT,
      file_count INTEGER NOT NULL,
      code_file_count INTEGER NOT NULL,
      symbol_count INTEGER NOT NULL,
      production_file_count INTEGER NOT NULL,
      dead_file_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      file_id TEXT PRIMARY KEY,
      first_seen_snapshot INTEGER NOT NULL,
      last_seen_snapshot INTEGER NOT NULL,
      current_path TEXT NOT NULL,
      FOREIGN KEY(first_seen_snapshot) REFERENCES snapshots(snapshot_id),
      FOREIGN KEY(last_seen_snapshot) REFERENCES snapshots(snapshot_id)
    );
    CREATE TABLE IF NOT EXISTS file_versions (
      snapshot_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      path TEXT NOT NULL,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      loc INTEGER NOT NULL DEFAULT 0,
      parse_error INTEGER NOT NULL DEFAULT 0,
      parse_diagnostic_count INTEGER NOT NULL DEFAULT 0,
      layer TEXT NOT NULL,
      usage_status TEXT NOT NULL,
      symbol_count INTEGER NOT NULL,
      production_reachable INTEGER NOT NULL,
      test_tool_reachable INTEGER NOT NULL,
      source_contract_reachable INTEGER NOT NULL,
      dead_island_id TEXT,
      cycle_id TEXT,
      line_sketch TEXT,
      PRIMARY KEY(snapshot_id, file_id),
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id),
      FOREIGN KEY(file_id) REFERENCES files(file_id)
    );
    CREATE INDEX IF NOT EXISTS idx_file_versions_path ON file_versions(path);
    CREATE INDEX IF NOT EXISTS idx_file_versions_hash ON file_versions(hash);
    CREATE TABLE IF NOT EXISTS dependencies (
      snapshot_id INTEGER NOT NULL,
      from_file_id TEXT NOT NULL,
      from_path TEXT NOT NULL,
      to_path TEXT,
      external_package TEXT,
      specifier TEXT NOT NULL,
      kind TEXT NOT NULL,
      line INTEGER,
      resolution TEXT,
      confidence REAL,
      authoritative INTEGER,
      imported_names TEXT,
      is_type_only INTEGER,
      metadata TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dependencies_from ON dependencies(snapshot_id, from_path);
    CREATE INDEX IF NOT EXISTS idx_dependencies_to ON dependencies(snapshot_id, to_path);
    CREATE TABLE IF NOT EXISTS dependency_diagnostics (
      snapshot_id INTEGER NOT NULL,
      from_path TEXT NOT NULL,
      specifier TEXT NOT NULL,
      kind TEXT NOT NULL,
      line INTEGER,
      resolution TEXT NOT NULL,
      reason TEXT,
      confidence REAL,
      candidates TEXT,
      metadata TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dependency_diagnostics_from ON dependency_diagnostics(snapshot_id, from_path);
    CREATE TABLE IF NOT EXISTS symbols (
      snapshot_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      path TEXT NOT NULL,
      qualname TEXT NOT NULL,
      symbol_name TEXT NOT NULL,
      kind TEXT,
      line_start INTEGER,
      line_end INTEGER,
      exported INTEGER NOT NULL,
      signature TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(symbol_name);
    CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(snapshot_id, path);
    CREATE TABLE IF NOT EXISTS module_exports (
      snapshot_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      path TEXT NOT NULL,
      export_name TEXT NOT NULL,
      local_name TEXT,
      export_kind TEXT,
      type_only INTEGER NOT NULL DEFAULT 0,
      line INTEGER,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_module_exports_path ON module_exports(snapshot_id, path);
    CREATE INDEX IF NOT EXISTS idx_module_exports_name ON module_exports(export_name);
    CREATE TABLE IF NOT EXISTS changes (
      snapshot_id INTEGER NOT NULL,
      file_id TEXT,
      change_type TEXT NOT NULL,
      old_path TEXT,
      new_path TEXT,
      old_hash TEXT,
      new_hash TEXT,
      details TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
    CREATE TABLE IF NOT EXISTS moves (
      snapshot_id INTEGER NOT NULL,
      file_id TEXT,
      old_path TEXT NOT NULL,
      new_path TEXT NOT NULL,
      detection TEXT NOT NULL,
      confidence REAL NOT NULL,
      details TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES snapshots(snapshot_id)
    );
  `);
  const versionCols = db.prepare('PRAGMA table_info(file_versions)').all().map((row) => row.name);
  if (!versionCols.includes('line_sketch')) db.exec('ALTER TABLE file_versions ADD COLUMN line_sketch TEXT');
  if (!versionCols.includes('loc')) db.exec('ALTER TABLE file_versions ADD COLUMN loc INTEGER NOT NULL DEFAULT 0');
  if (!versionCols.includes('parse_error')) db.exec('ALTER TABLE file_versions ADD COLUMN parse_error INTEGER NOT NULL DEFAULT 0');
  if (!versionCols.includes('parse_diagnostic_count')) db.exec('ALTER TABLE file_versions ADD COLUMN parse_diagnostic_count INTEGER NOT NULL DEFAULT 0');
  const depCols = db.prepare('PRAGMA table_info(dependencies)').all().map((row) => row.name);
  if (!depCols.includes('resolution')) db.exec('ALTER TABLE dependencies ADD COLUMN resolution TEXT');
  if (!depCols.includes('confidence')) db.exec('ALTER TABLE dependencies ADD COLUMN confidence REAL');
  if (!depCols.includes('authoritative')) db.exec('ALTER TABLE dependencies ADD COLUMN authoritative INTEGER');
  if (!depCols.includes('metadata')) db.exec('ALTER TABLE dependencies ADD COLUMN metadata TEXT');
  if (!depCols.includes('imported_names')) db.exec('ALTER TABLE dependencies ADD COLUMN imported_names TEXT');
  if (!depCols.includes('is_type_only')) db.exec('ALTER TABLE dependencies ADD COLUMN is_type_only INTEGER');
}

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim() || null; }
  catch { return null; }
}

function writeHistory(snapshot) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  initDb(db);
  const prevSnap = db.prepare('SELECT * FROM snapshots ORDER BY snapshot_id DESC LIMIT 1').get();
  if (prevSnap && prevSnap.root_hash === snapshot.rootHash && !FORCE_SNAPSHOT) {
    const ids = Object.fromEntries(db.prepare('SELECT fv.path,fv.file_id FROM file_versions fv WHERE fv.snapshot_id=?').all(prevSnap.snapshot_id).map((row)=>[row.path,row.file_id]));
    db.close();
    return { snapshotId: prevSnap.snapshot_id, reused: true, changes: [], moves: [], fileIds: ids };
  }

  const prevRows = prevSnap ? db.prepare('SELECT fv.*, f.file_id FROM file_versions fv JOIN files f ON f.file_id=fv.file_id WHERE fv.snapshot_id=?').all(prevSnap.snapshot_id) : [];
  const prevSymbolRows = prevSnap ? db.prepare('SELECT file_id,qualname,kind FROM symbols WHERE snapshot_id=?').all(prevSnap.snapshot_id) : [];
  const prevSymbolsByFileId = new Map();
  for (const row of prevSymbolRows) { const arr = prevSymbolsByFileId.get(row.file_id) || []; arr.push(`${row.kind||''}:${row.qualname}`); prevSymbolsByFileId.set(row.file_id, arr); }
  const insertSnap = db.prepare(`INSERT INTO snapshots(created_at,root_hash,git_commit,file_count,code_file_count,symbol_count,production_file_count,dead_file_count) VALUES(?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  let snapshotId;
  try {
    const snapInfo = insertSnap.run(snapshot.generatedAt, snapshot.rootHash, snapshot.gitCommit, snapshot.summary.totalFiles, snapshot.summary.codeFiles, snapshot.summary.symbols, snapshot.summary.productionRuntimeFiles, snapshot.summary.deadFiles);
    snapshotId = Number(snapInfo.lastInsertRowid);
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    throw err;
  }
  const { assignments, changes, moves } = detectFileLineage({
    previousRows: prevRows,
    previousSymbolsByFileId: prevSymbolsByFileId,
    currentFiles: snapshot.files,
    createFileId: () => `file_${crypto.randomUUID()}`,
  });

  const insFile = db.prepare('INSERT OR IGNORE INTO files(file_id,first_seen_snapshot,last_seen_snapshot,current_path) VALUES(?,?,?,?)');
  const updFile = db.prepare('UPDATE files SET last_seen_snapshot=?, current_path=? WHERE file_id=?');
  const insVer = db.prepare('INSERT INTO file_versions(snapshot_id,file_id,path,hash,size,loc,parse_error,parse_diagnostic_count,layer,usage_status,symbol_count,production_reachable,test_tool_reachable,source_contract_reachable,dead_island_id,cycle_id,line_sketch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insDep = db.prepare('INSERT INTO dependencies(snapshot_id,from_file_id,from_path,to_path,external_package,specifier,kind,line,resolution,confidence,authoritative,imported_names,is_type_only,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insDepDiag = db.prepare('INSERT INTO dependency_diagnostics(snapshot_id,from_path,specifier,kind,line,resolution,reason,confidence,candidates,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insSym = db.prepare('INSERT INTO symbols(snapshot_id,file_id,path,qualname,symbol_name,kind,line_start,line_end,exported,signature) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insExport = db.prepare('INSERT INTO module_exports(snapshot_id,file_id,path,export_name,local_name,export_kind,type_only,line) VALUES(?,?,?,?,?,?,?,?)');
  const insChange = db.prepare('INSERT INTO changes(snapshot_id,file_id,change_type,old_path,new_path,old_hash,new_hash,details) VALUES(?,?,?,?,?,?,?,?)');
  const insMove = db.prepare('INSERT INTO moves(snapshot_id,file_id,old_path,new_path,detection,confidence,details) VALUES(?,?,?,?,?,?,?)');

  try {
    for (const f of snapshot.files) {
      const id = assignments.get(f.path);
      insFile.run(id, snapshotId, snapshotId, f.path); updFile.run(snapshotId, f.path, id);
      insVer.run(snapshotId,id,f.path,f.hash,f.size,f.loc||0,f.parseError?1:0,f.parseDiagnosticCount||0,f.layer,f.usageStatus,f.symbolCount,f.reachability.production?1:0,f.reachability.testTool?1:0,f.reachability.sourceContract?1:0,f.deadIslandId,f.cycleId,f.lineSketch?JSON.stringify(f.lineSketch):null);
      for (const d of f.dependencies.internal) insDep.run(snapshotId,id,f.path,d.target,null,d.specifier,d.kind,d.line,d.resolution||'exact',d.confidence??1,1,JSON.stringify(d.importedNames||[]),d.isTypeOnly?1:0,d.metadata?JSON.stringify(d.metadata):null);
      for (const d of f.dependencies.probableInternal || []) {
        insDep.run(snapshotId,id,f.path,d.target,null,d.specifier,d.kind,d.line,d.resolution||'fuzzy-probable',d.confidence??null,0,JSON.stringify(d.importedNames||[]),d.isTypeOnly?1:0,d.metadata?JSON.stringify(d.metadata):null);
        insDepDiag.run(snapshotId,f.path,d.specifier,d.kind,d.line,d.resolution||'fuzzy-probable','probable resolution; excluded from hard liveness proof',d.confidence??null,JSON.stringify(d.candidates||[]),d.metadata?JSON.stringify(d.metadata):null);
      }
      for (const d of f.dependencies.external) insDep.run(snapshotId,id,f.path,null,d.package,d.specifier,d.kind,d.line,d.resolution||'external',1,0,JSON.stringify(d.importedNames||[]),d.isTypeOnly?1:0,d.portabilityRisk?JSON.stringify({portabilityRisk:true}):null);
      for (const d of f.dependencies.unresolved || []) insDepDiag.run(snapshotId,f.path,d.specifier,d.kind,d.line,d.resolution||'unresolved',d.reason||null,d.confidence??null,JSON.stringify(d.candidates||[]),d.metadata?JSON.stringify(d.metadata):null);
      for (const s of f.symbols) insSym.run(snapshotId,id,f.path,s.qualname,s.name,s.kind,s.line,s.lineEnd,s.exported?1:0,s.signature||null);
      for (const e of f.moduleExports || []) insExport.run(snapshotId,id,f.path,e.name,e.localName||null,e.kind||null,e.typeOnly?1:0,e.line||null);
    }
    for (const c of changes) insChange.run(snapshotId,c.fileId,c.type,c.oldPath,c.newPath,c.oldHash,c.newHash,c.details);
    for (const m of moves) insMove.run(snapshotId,m.fileId,m.oldPath,m.newPath,m.detection,m.confidence,m.details);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    throw err;
  }
  db.close();
  return { snapshotId, reused: false, changes, moves, fileIds: Object.fromEntries(assignments) };
}

function buildFolderTree(files, dirs) {
  const nodes = new Map();
  for (const d of dirs) nodes.set(d, { path: d, directFiles: [], children: [], recursiveFileCount: 0, statusCounts: {}, layerCounts: {} });
  if (!nodes.has('.')) nodes.set('.', { path: '.', directFiles: [], children: [], recursiveFileCount: 0, statusCounts: {}, layerCounts: {} });
  for (const d of dirs) {
    if (d === '.') continue;
    const p = path.posix.dirname(d) || '.';
    if (!nodes.has(p)) nodes.set(p, { path: p, directFiles: [], children: [], recursiveFileCount: 0, statusCounts: {}, layerCounts: {} });
    nodes.get(p).children.push(d);
  }
  for (const f of files) {
    const d = path.posix.dirname(f.path) || '.';
    if (!nodes.has(d)) nodes.set(d, { path: d, directFiles: [], children: [], recursiveFileCount: 0, statusCounts: {}, layerCounts: {} });
    nodes.get(d).directFiles.push(f.path);
    let cur = d;
    while (true) {
      const n = nodes.get(cur); n.recursiveFileCount++; n.statusCounts[f.usageStatus] = (n.statusCounts[f.usageStatus]||0)+1; n.layerCounts[f.layer] = (n.layerCounts[f.layer]||0)+1;
      if (cur === '.') break;
      cur = path.posix.dirname(cur) || '.';
    }
  }
  for (const n of nodes.values()) { n.children.sort(); n.directFiles.sort(); }
  return Object.fromEntries([...nodes.entries()].sort(([a],[b]) => a.localeCompare(b)));
}

function renderTree(folderTree, filesByPath) {
  const lines = ['# APEX Repository Tree', '', 'Generated by `npm run index:app`.', '', 'Legend: `[status | layer | symbols]`', ''];
  const recurse = (folder, indent) => {
    const node = folderTree[folder];
    const label = folder === '.' ? '.' : path.posix.basename(folder);
    lines.push(`${'  '.repeat(indent)}- 📁 ${label}/  (${node.recursiveFileCount} files)`);
    for (const file of node.directFiles) {
      const f = filesByPath[file];
      lines.push(`${'  '.repeat(indent+1)}- ${path.posix.basename(file)}  [${f.usageStatus} | ${f.layer} | ${f.symbolCount} symbols]`);
    }
    for (const child of node.children) recurse(child, indent + 1);
  };
  recurse('.', 0);
  return `${lines.join('\n')}\n`;
}

function renderDot(snapshot) {
  const lines = ['digraph APEX_APP_INDEX {', '  rankdir=LR;', '  graph [label="APEX file dependency graph", labelloc=t];', '  node [shape=box, fontsize=9];'];
  const ids = new Map();
  let seq = 0;
  for (const f of snapshot.files.filter((f) => f.code || f.usageStatus === 'production-asset')) {
    const id = `n${seq++}`; ids.set(f.path, id);
    const label = `${f.path}\\n${f.usageStatus}\\n${f.layer}`.replaceAll('"','\\"');
    const shape = f.usageStatus === 'dead-island' || f.usageStatus === 'orphan' ? 'octagon' : f.rootKinds?.length ? 'doubleoctagon' : 'box';
    lines.push(`  ${id} [label="${label}", shape=${shape}];`);
  }
  for (const f of snapshot.files) {
    const from = ids.get(f.path); if (!from) continue;
    for (const d of f.dependencies.internal || []) {
      const to = ids.get(d.target); if (!to) continue;
      const style = d.kind.startsWith('type-') ? 'dashed' : 'solid';
      lines.push(`  ${from} -> ${to} [label="${d.kind}", style=${style}];`);
    }
    for (const d of f.dependencies.probableInternal || []) {
      const to = ids.get(d.target); if (!to) continue;
      lines.push(`  ${from} -> ${to} [label="${d.kind}:probable", style=dotted];`);
    }
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function renderLayerMermaid(snapshot) {
  const edgeCounts = new Map();
  const layerIds = new Map();
  const layers = [...new Set(snapshot.files.map((f)=>f.layer))].sort();
  layers.forEach((layer,i)=>layerIds.set(layer,`L${i}`));
  for (const f of snapshot.files) {
    for (const d of f.dependencies.internal || []) {
      const target = snapshot.filesByPath?.[d.target];
      if (!target || target.layer === f.layer) continue;
      const key = `${f.layer}\u0000${target.layer}`;
      edgeCounts.set(key,(edgeCounts.get(key)||0)+1);
    }
  }
  const lines = ['flowchart LR'];
  for (const layer of layers) {
    const count = snapshot.summary.layerCounts[layer] || 0;
    lines.push(`  ${layerIds.get(layer)}["${layer}\\n${count} files"]`);
  }
  for (const [key,count] of [...edgeCounts.entries()].sort()) {
    const [a,b] = key.split('\u0000');
    lines.push(`  ${layerIds.get(a)} -->|${count}| ${layerIds.get(b)}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderMapMd(snapshot, hist) {
  const deadIslands = snapshot.deadIslands.filter((d) => d.files.length > 0);
  const cycles = snapshot.cycles.filter((c) => c.files.length > 1);
  const lines = [
    '# APEX App Index — Code Cartography', '',
    `Generated: ${snapshot.generatedAt}`, '',
    'This map distinguishes **dependency edges** from **actual liveness**. A file can be imported by another file and still be dead when neither is transitively reachable from a valid root.', '',
    '## Summary', '',
    `- Repository files mapped: ${snapshot.summary.totalFiles}`,
    `- Code files: ${snapshot.summary.codeFiles}`,
    `- Function Atlas symbols linked: ${snapshot.summary.symbols}`,
    `- AST top-level declarations: ${snapshot.summary.astDeclarations}`,
    `- Module exports indexed: ${snapshot.summary.moduleExports}`,
    `- Advisory unused-export candidates: ${snapshot.summary.unusedExportCandidates}`,
    `- Total mapped LOC: ${snapshot.summary.totalLoc}`,
    `- Parse-error files: ${snapshot.summary.parseErrorFiles}`,
    `- Production-runtime files: ${snapshot.summary.productionRuntimeFiles}`,
    `- Production type-only files: ${snapshot.summary.productionTypeOnlyFiles}`,
    `- Test/tool-only files: ${snapshot.summary.testToolOnlyFiles}`,
    `- Source-contract-only files: ${snapshot.summary.sourceContractOnlyFiles}`,
    `- Dead files (dead-island + orphan): ${snapshot.summary.deadFiles}`,
    `- Dead islands: ${deadIslands.length}`,
    `- Runtime cycles/SCCs (>1 file): ${cycles.length}`,
    `- Unresolved imports: ${snapshot.summary.unresolvedImports} (static=${snapshot.summary.unresolvedStaticImports}, dynamic=${snapshot.summary.unresolvedDynamicImports})`,
    `- Probable/fuzzy resolutions: ${snapshot.summary.probableResolutions} (never hard liveness proof)`,
    `- Case-mismatch fallback resolutions: ${snapshot.summary.caseMismatchResolutions}`,
    `- Absolute runtime imports (portability risks): ${snapshot.summary.absoluteRuntimeImports}`,
    `- Dead classification trusted: ${snapshot.summary.deadClassificationTrusted}`,
    `- History snapshot: ${hist.snapshotId}${hist.reused ? ' (unchanged; reused)' : ''}`,
    `- Root hash: \`${snapshot.rootHash}\``, '',
    '## Production Roots', '', ...snapshot.roots.production.map((r) => `- \`${r}\``), '',
    '## Query Recipes', '',
    '- `npm run index:app:file -- src/services/foo.ts` — layer, symbols, deps, reverse deps, reachability proof and history.',
    '- `npm run index:app:folder -- src/services` — recursive folder map and status counts.',
    '- `npm run index:app:dead` — dead islands; imported-by-dead does **not** count as live.',
    '- `npm run index:app:history -- src/services/foo.ts` — snapshot/path history from SQLite.',
    '- `npm run index:app:why -- src/services/foo.ts` — shortest liveness proof, roots, dead-island/cycle evidence and dependency context.',
    '- `npm run index:app:symbol -- "pattern"` — symbol lookup through the map.', '',
    '## Largest Dead Islands', '',
    '| Island | Files | Example |', '|---|---:|---|',
    ...deadIslands.slice(0, 30).map((d) => `| ${d.id} | ${d.files.length} | \`${d.files[0]}\` |`), '',
    '## Runtime Dependency Cycles', '',
    '| Cycle | Files |', '|---|---:|', ...cycles.slice(0, 40).map((c) => `| ${c.id} | ${c.files.length} |`), '',
    '## Layers', '', '| Layer | Files |', '|---|---:|',
    ...Object.entries(snapshot.summary.layerCounts).sort(([a],[b]) => a.localeCompare(b)).map(([l,n]) => `| \`${l}\` | ${n} |`), '',
    'See `APP_INDEX/TREE.md` for the complete folder/file hierarchy, `APP_INDEX/APP_GRAPH.dot` for the file graph, `APP_INDEX/LAYER_GRAPH.mmd` for the layer graph, and `APP_INDEX/APP_MAP.json` for machine-readable detail.', ''
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const atlas = loadAtlas();
  const layers = loadLayers();
  const { files: absFiles, dirs } = walkRepo();
  const allPaths = new Set(absFiles.map(rel));
  const resolver = createRepositoryResolver({ root: ROOT, allFiles: allPaths, ts });
  const atlasSymbolsByFile = new Map();
  for (const e of atlas.entries || []) { const arr = atlasSymbolsByFile.get(e.file) || []; arr.push(e); atlasSymbolsByFile.set(e.file, arr); }
  const atlasUsage = atlas.fileUsage || {};

  const records = [];
  const runtimeAdj = new Map(), allAdj = new Map(), possibleRuntimeAdj = new Map(), possibleAllAdj = new Map();
  const reverseRuntime = new Map(), reverseAll = new Map(), reverseProbable = new Map();
  const depsByPath = new Map();
  for (const abs of absFiles) {
    const file = rel(abs);
    const dep = parseFileDependencies({ absPath: abs, file, resolver, ts, allFiles: allPaths }); depsByPath.set(file, dep);
    const runtimeTargets = new Set(dep.internal.filter((d) => !d.kind.startsWith('type-')).map((d) => d.target));
    const allTargets = new Set(dep.internal.map((d) => d.target));
    const probableRuntimeTargets = new Set(dep.probableInternal.filter((d) => !d.kind.startsWith('type-')).map((d) => d.target));
    const probableAllTargets = new Set(dep.probableInternal.map((d) => d.target));
    runtimeAdj.set(file, runtimeTargets); allAdj.set(file, allTargets);
    possibleRuntimeAdj.set(file, new Set([...runtimeTargets, ...probableRuntimeTargets]));
    possibleAllAdj.set(file, new Set([...allTargets, ...probableAllTargets]));
    for (const t of runtimeTargets) { const set = reverseRuntime.get(t) || new Set(); set.add(file); reverseRuntime.set(t, set); }
    for (const t of allTargets) { const set = reverseAll.get(t) || new Set(); set.add(file); reverseAll.set(t, set); }
    for (const t of probableAllTargets) { const set = reverseProbable.get(t) || new Set(); set.add(file); reverseProbable.set(t, set); }
  }
  for (const p of allPaths) {
    if (!runtimeAdj.has(p)) runtimeAdj.set(p, new Set());
    if (!allAdj.has(p)) allAdj.set(p, new Set());
    if (!possibleRuntimeAdj.has(p)) possibleRuntimeAdj.set(p, new Set());
    if (!possibleAllAdj.has(p)) possibleAllAdj.set(p, new Set());
  }

  const prodRoots = ['server.ts', 'index.html', 'src/main.tsx'].filter((p) => allPaths.has(p));
  const toolRootSet = packageScriptRoots(allPaths);
  if (allPaths.has('vite.config.ts')) toolRootSet.add('vite.config.ts');
  const toolRoots = [...toolRootSet].sort();
  const testRoots = [...allPaths].filter((p) => /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(p)).sort();
  const prodRuntime = bfsProof(prodRoots, runtimeAdj);
  const prodAll = bfsProof(prodRoots, allAdj);
  const possibleProdRuntime = bfsProof(prodRoots, possibleRuntimeAdj);
  const possibleProdAll = bfsProof(prodRoots, possibleAllAdj);
  const testTool = bfsProof([...new Set([...toolRoots, ...testRoots])], allAdj);

  const codeNodes = new Set([...allPaths].filter(isCode));
  const runtimeSccs = tarjan(codeNodes, runtimeAdj);
  const cycleByFile = new Map(), cycles = [];
  let cycleSeq = 1;
  for (const c of runtimeSccs) {
    const selfLoop = c.length === 1 && runtimeAdj.get(c[0])?.has(c[0]);
    if (c.length <= 1 && !selfLoop) continue;
    const id = `cycle-${String(cycleSeq++).padStart(3,'0')}`; cycles.push({ id, files: c }); for (const f of c) cycleByFile.set(f,id);
  }

  const unreachableCode = new Set([...codeNodes].filter((f) => !possibleProdAll.reached.has(f) && !testTool.reached.has(f) && !atlasUsage[f]?.sourceContractReachable));
  const deadComps = weakComponents(unreachableCode, allAdj, reverseAll);
  const deadIslandByFile = new Map(), deadIslands = [];
  let islandSeq = 1;
  for (const c of deadComps) {
    const id = `dead-${String(islandSeq++).padStart(3,'0')}`; deadIslands.push({ id, files: c }); for (const f of c) deadIslandByFile.set(f,id);
  }

  for (const abs of absFiles) {
    const file = rel(abs); const stat = fs.statSync(abs); const buf = fs.readFileSync(abs); const dep = depsByPath.get(file);
    const production = prodRuntime.reached.has(file);
    const prodType = !production && prodAll.reached.has(file);
    const possibleProduction = !production && possibleProdRuntime.reached.has(file);
    const possibleProdType = !production && !prodType && possibleProdAll.reached.has(file);
    const tt = testTool.reached.has(file);
    const sc = Boolean(atlasUsage[file]?.sourceContractReachable);
    const incoming = [...(reverseAll.get(file) || [])].sort();
    const probableIncoming = [...(reverseProbable.get(file) || [])].sort();
    const outgoing = [...(allAdj.get(file) || [])].sort();
    let usageStatus = 'non-code/unclassified';
    const assetLike = file.startsWith('public/') || file === 'index.html' || ['.css','.svg','.png','.jpg','.jpeg','.webp','.json','.html'].includes(path.extname(file).toLowerCase());
    if (assetLike && (production || incoming.some((x) => prodRuntime.reached.has(x)))) usageStatus = 'production-asset';
    else if (assetLike && tt) usageStatus = 'test-tool-asset';
    else if (isCode(file)) {
      if (production) usageStatus = 'production-runtime';
      else if (prodType) usageStatus = 'production-type-only';
      else if (possibleProduction) usageStatus = 'possible-production-runtime';
      else if (possibleProdType) usageStatus = 'possible-production-type-only';
      else if (tt) usageStatus = 'test-tool-only';
      else if (sc) usageStatus = 'source-contract-only';
      else if (incoming.length || outgoing.length) usageStatus = 'dead-island';
      else usageStatus = 'orphan';
    } else if (incoming.length) usageStatus = 'referenced-asset';
    else if (file.startsWith('Doc/') || file.startsWith('QA/') || file.startsWith('APP_INDEX/')) usageStatus = 'repository-artifact';
    else usageStatus = 'unreferenced-noncode';

    const symbols = (atlasSymbolsByFile.get(file) || []).sort((a,b) => a.line-b.line);
    const sourceContractReferencedBy = atlasUsage[file]?.sourceContractReferencedBy || [];
    records.push({
      path: file,
      folder: path.posix.dirname(file) || '.',
      basename: path.posix.basename(file),
      extension: path.extname(file).toLowerCase(),
      size: stat.size,
      loc: dep.syntax?.loc || (isText(file) ? (buf.length ? buf.toString('utf8').split(/\r?\n/).length : 0) : 0),
      parseError: Boolean(dep.syntax?.parseError),
      parseDiagnosticCount: dep.syntax?.parseDiagnosticCount || 0,
      astDeclarations: dep.syntax?.declarations || [],
      moduleExports: dep.syntax?.exports || [],
      hash: sha256Buffer(buf),
      layer: inferLayer(file, layers),
      code: isCode(file),
      snapshotTriggerIncluded: !SNAPSHOT_TRIGGER_EXCLUDED.has(file) && !GENERATED_INDEX_FILES.has(file),
      usageStatus,
      rootKinds: [prodRoots.includes(file) ? 'production-root' : null, toolRoots.includes(file) ? 'tool-root' : null, testRoots.includes(file) ? 'test-root' : null].filter(Boolean),
      reachability: {
        production,
        productionTypeOnly: prodType,
        possibleProduction,
        possibleProductionTypeOnly: possibleProdType,
        testTool: tt,
        sourceContract: sc,
        productionProof: production || prodType ? prodAll.proofFor(file) : [],
        possibleProductionProof: (possibleProduction || possibleProdType) ? possibleProdAll.proofFor(file) : [],
        testToolProof: tt ? testTool.proofFor(file) : [],
        sourceContractReferencedBy,
      },
      dependencies: {
        internal: dep.internal.sort((a,b) => a.target.localeCompare(b.target) || a.line-b.line),
        probableInternal: dep.probableInternal.sort((a,b) => a.target.localeCompare(b.target) || a.line-b.line),
        external: dep.external.sort((a,b) => a.package.localeCompare(b.package) || a.line-b.line),
        unresolved: dep.unresolved.sort((a,b) => a.specifier.localeCompare(b.specifier)),
        reverse: incoming,
        probableReverse: probableIncoming,
        fanOut: outgoing.length,
        fanIn: incoming.length,
      },
      cycleId: cycleByFile.get(file) || null,
      deadIslandId: deadIslandByFile.get(file) || null,
      symbolCount: symbols.length,
      symbols: symbols.map((s) => ({ name:s.name, qualname:s.qualname, kind:s.kind, line:s.line, lineEnd:s.lineEnd, exported:Boolean(s.exported), async:Boolean(s.async), signature:s.signature, tags:s.tags || [] })),
      textPreview: isText(file) && stat.size <= 512000 ? buf.toString('utf8') : null,
      lineSketch: isText(file) && stat.size <= 512000 ? makeLineSketch(buf.toString('utf8')) : null,
    });
  }
  records.sort((a,b) => a.path.localeCompare(b.path));

  // Symbol-level usage evidence. A named import is evidence that a specific
  // export is consumed; namespace/dynamic/require edges are deliberately
  // wildcard evidence and suppress unused-export claims for that target.
  // This is advisory only: unlike file liveness, export usage is never used
  // as permission to delete code automatically.
  const importedNamesByTarget = new Map();
  const wildcardTargets = new Set();
  for (const from of records) {
    for (const edge of from.dependencies.internal || []) {
      const target = edge.target;
      if (!target) continue;
      const names = edge.importedNames || [];
      if (names.includes('*')) wildcardTargets.add(target);
      const set = importedNamesByTarget.get(target) || new Set();
      for (const name of names) if (name !== '*') set.add(name);
      importedNamesByTarget.set(target, set);
    }
  }
  const unusedExportCandidates = [];
  for (const f of records) {
    const imported = importedNamesByTarget.get(f.path) || new Set();
    const wildcardInbound = wildcardTargets.has(f.path);
    const eligible = f.code && !['dead-island','orphan','source-contract-only'].includes(f.usageStatus);
    const unused = [];
    if (eligible && !wildcardInbound) {
      for (const exp of f.moduleExports || []) {
        if (!imported.has(exp.name)) {
          const item = { file: f.path, name: exp.name, localName: exp.localName || null, kind: exp.kind || null, typeOnly: Boolean(exp.typeOnly), line: exp.line || null, confidence: 'candidate-only' };
          unused.push(item); unusedExportCandidates.push(item);
        }
      }
    }
    f.exportUsage = {
      trustedForDeletion: false,
      wildcardInbound,
      importedNames: [...imported].sort(),
      unusedCandidates: unused,
      note: wildcardInbound ? 'Wildcard/dynamic/require consumer exists; named export usage is intentionally not inferred.' : 'Candidates are advisory evidence only and require semantic review before changing exports.',
    };
  }

  const rootHash = sha256Text(records.filter((f)=>f.snapshotTriggerIncluded).map((f) => `${f.path}\0${f.hash}`).join('\n'));
  const layerCounts = {}, statusCounts = {};
  for (const f of records) { layerCounts[f.layer]=(layerCounts[f.layer]||0)+1; statusCounts[f.usageStatus]=(statusCounts[f.usageStatus]||0)+1; }
  const snapshot = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    methodology: {
      liveness: 'transitive-reachability-from-explicit-roots',
      deadIsland: 'weak-component-among-unreachable-code-files',
      cycles: 'tarjan-strongly-connected-components-on-runtime-import-graph',
      symbols: 'canonical-APEX-Function-Atlas plus TypeScript AST top-level declaration/export facts',
      exportUsage: 'named-import evidence with wildcard suppression; unused exports are advisory candidates only and never automatic deletion proof',
      history: 'SQLite-snapshots-with-exact-hash-move-lineage; probable moves never treated as certain',
      moduleResolution: 'config-aware resolver: tsconfig paths/baseUrl + Vite aliases + package imports + case-insensitive portability fallback + Vite glob/dynamic templates; fuzzy matches are probable-only',
    },
    resolution: resolver.summary,
    rootHash,
    gitCommit: gitCommit(),
    roots: { production: prodRoots, tool: toolRoots, test: testRoots },
    summary: {
      totalFiles: records.length,
      codeFiles: records.filter((f)=>f.code).length,
      symbols: records.reduce((n,f)=>n+f.symbolCount,0),
      astDeclarations: records.reduce((n,f)=>n+(f.astDeclarations?.length||0),0),
      moduleExports: records.reduce((n,f)=>n+(f.moduleExports?.length||0),0),
      unusedExportCandidates: unusedExportCandidates.length,
      parseErrorFiles: records.filter((f)=>f.parseError).length,
      totalLoc: records.reduce((n,f)=>n+(f.loc||0),0),
      productionRuntimeFiles: records.filter((f)=>f.usageStatus==='production-runtime').length,
      productionTypeOnlyFiles: records.filter((f)=>f.usageStatus==='production-type-only').length,
      possibleProductionFiles: records.filter((f)=>f.usageStatus==='possible-production-runtime'||f.usageStatus==='possible-production-type-only').length,
      testToolOnlyFiles: records.filter((f)=>f.usageStatus==='test-tool-only').length,
      sourceContractOnlyFiles: records.filter((f)=>f.usageStatus==='source-contract-only').length,
      deadFiles: records.filter((f)=>f.usageStatus==='dead-island'||f.usageStatus==='orphan').length,
      unresolvedImports: records.reduce((n,f)=>n+f.dependencies.unresolved.length,0),
      unresolvedDynamicImports: records.reduce((n,f)=>n+f.dependencies.unresolved.filter((d)=>d.resolution==='dynamic-unresolved').length,0),
      unresolvedStaticImports: records.reduce((n,f)=>n+f.dependencies.unresolved.filter((d)=>d.resolution!=='dynamic-unresolved').length,0),
      probableResolutions: records.reduce((n,f)=>n+f.dependencies.probableInternal.length,0),
      caseMismatchResolutions: records.reduce((n,f)=>n+f.dependencies.internal.filter((d)=>d.caseMismatch).length,0),
      absoluteRuntimeImports: records.reduce((n,f)=>n+f.dependencies.external.filter((d)=>d.resolution==='external-absolute-runtime').length,0),
      liveUnresolvedDynamicImports: records.reduce((n,f)=>n+((f.reachability.production||f.reachability.productionTypeOnly)?f.dependencies.unresolved.filter((d)=>d.resolution==='dynamic-unresolved').length:0),0),
      deadClassificationTrusted: !records.some((f)=>(f.reachability.production||f.reachability.productionTypeOnly) && f.dependencies.unresolved.some((d)=>d.resolution==='dynamic-unresolved')),
      layerCounts, statusCounts,
    },
    deadIslands,
    cycles,
    unusedExportCandidates,
    folders: buildFolderTree(records, dirs),
    files: records.map(({ textPreview, lineSketch, ...f }) => f),
  };

  if (CHECK_ONLY) {
    if (!fs.existsSync(MAP_JSON)) { console.error('APP_INDEX/APP_MAP.json missing. Run `npm run index:app`.'); process.exit(1); }
    const current = JSON.parse(fs.readFileSync(MAP_JSON, 'utf8'));
    if (current.rootHash !== snapshot.rootHash) { console.error(`App Index stale: tracked=${current.rootHash} current=${snapshot.rootHash}`); process.exit(1); }
    console.log(`App Index fresh: ${snapshot.summary.totalFiles} files, ${snapshot.summary.symbols} symbols, rootHash=${snapshot.rootHash.slice(0,16)}…`);
    return;
  }

  const history = writeHistory({ ...snapshot, files: records });
  const publicSnapshot = { ...snapshot, files: snapshot.files.map((f)=>({ ...f, fileId: history.fileIds?.[f.path] || null })), history: { snapshotId: history.snapshotId, reused: history.reused, changes: history.changes.length, moves: history.moves.length } };
  const filesByPath = Object.fromEntries(publicSnapshot.files.map((f) => [f.path, f]));
  const renderSnapshot = { ...publicSnapshot, filesByPath };
  fs.writeFileSync(MAP_JSON, `${JSON.stringify(publicSnapshot, null, 2)}\n`);
  fs.writeFileSync(MAP_MD, renderMapMd(publicSnapshot, history));
  fs.writeFileSync(TREE_MD, renderTree(publicSnapshot.folders, filesByPath));
  fs.writeFileSync(GRAPH_DOT, renderDot(publicSnapshot));
  fs.writeFileSync(LAYER_MMD, renderLayerMermaid(renderSnapshot));
  console.log(`App Index: ${snapshot.summary.totalFiles} files / ${snapshot.summary.symbols} atlas symbols`);
  console.log(`  production=${snapshot.summary.productionRuntimeFiles} typeOnly=${snapshot.summary.productionTypeOnlyFiles} testTool=${snapshot.summary.testToolOnlyFiles} sourceContract=${snapshot.summary.sourceContractOnlyFiles}`);
  console.log(`  dead=${snapshot.summary.deadFiles} islands=${deadIslands.length} cycles=${cycles.length} unresolved=${snapshot.summary.unresolvedImports} dynamic=${snapshot.summary.unresolvedDynamicImports} probable=${snapshot.summary.probableResolutions} caseMismatch=${snapshot.summary.caseMismatchResolutions}`);
  console.log(`  history snapshot=${history.snapshotId}${history.reused ? ' (reused)' : ''}; changes=${history.changes.length}; moves=${history.moves.length}`);
  console.log(`  rootHash=${snapshot.rootHash}`);
}

main();
