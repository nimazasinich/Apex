#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync, execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MAP = path.join(ROOT, 'APP_INDEX', 'APP_MAP.json');
const DB = path.join(ROOT, 'APP_INDEX', 'app-index.sqlite');
if (!fs.existsSync(MAP)) { console.error('APP_INDEX missing. Run: npm run index:app'); process.exit(1); }
const fresh = spawnSync(process.execPath, ['scripts/utilities/generateAppIndex.mjs', '--check'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
if (fresh.status !== 0) {
  console.error('APP_INDEX is stale. Run `npm run index:app` before trusting repository cartography.');
  if (fresh.stderr) console.error(fresh.stderr.trim());
  process.exit(2);
}
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const files = new Map(map.files.map((f) => [f.path, f]));
const norm = (p) => p.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
const rawArgs = process.argv.slice(2);
const JSON_MODE = rawArgs.includes('--json');
const args = rawArgs.filter((arg) => arg !== '--json');
const [mode, ...rest] = args;

function printFile(p) {
  p = norm(p); const f = files.get(p);
  if (!f) { console.error(`No indexed file: ${p}`); process.exit(1); }
  console.log(JSON.stringify(f, null, 2));
}
function printFolder(p) {
  p = norm(p || '.'); if (!p) p='.';
  const folder = map.folders[p];
  if (!folder) { console.error(`No indexed folder: ${p}`); process.exit(1); }
  console.log(JSON.stringify(folder, null, 2));
}
function printDead() {
  const dead = map.files.filter((f) => f.usageStatus === 'dead-island' || f.usageStatus === 'orphan');
  if (JSON_MODE) { console.log(JSON.stringify({ deadFiles: dead.map((f)=>({path:f.path,layer:f.layer,status:f.usageStatus,deadIslandId:f.deadIslandId})), deadIslands: map.deadIslands })); return; }
  console.log(`Dead code files: ${dead.length}; islands=${map.deadIslands.length}`);
  for (const island of map.deadIslands) {
    console.log(`\n${island.id} (${island.files.length})`);
    for (const p of island.files) console.log(`  ${p}`);
  }
}
function printLayer(pattern) {
  const re = new RegExp(pattern, 'i');
  const hits = map.files.filter((f) => re.test(f.layer));
  if (JSON_MODE) { console.log(JSON.stringify(hits.map((f)=>({path:f.path,layer:f.layer,status:f.usageStatus,loc:f.loc||0})))); return; }
  console.log(`Layer matches: ${hits.length}`);
  for (const f of hits) console.log(`${f.layer}\t${f.usageStatus}\t${f.path}`);
}
function printSymbol(pattern) {
  const re = new RegExp(pattern, 'i'); const hits=[];
  for (const f of map.files) for (const s of f.symbols || []) if (re.test(s.name)||re.test(s.qualname)||re.test(f.path)) hits.push({...s,file:f.path});
  if (JSON_MODE) { console.log(JSON.stringify(hits)); return; }
  for (const s of hits) console.log(`${s.qualname} [${s.kind}] -> ${s.file}:${s.line}-${s.lineEnd}`);
  if (!hits.length) console.log(`No symbol matches for /${pattern}/i`);
}
function printWhy(p) {
  p = norm(p); const f = files.get(p);
  if (!f) { console.error(`No indexed file: ${p}`); process.exit(1); }
  console.log(`${p}\nstatus=${f.usageStatus}\nlayer=${f.layer}`);
  if (f.reachability.productionProof?.length) console.log(`production proof: ${f.reachability.productionProof.join(' -> ')}`);
  else if (f.reachability.possibleProductionProof?.length) console.log(`possible production proof (contains probable/fuzzy edge; NOT authoritative): ${f.reachability.possibleProductionProof.join(' -> ')}`);
  else if (f.reachability.testToolProof?.length) console.log(`test/tool proof: ${f.reachability.testToolProof.join(' -> ')}`);
  else if (f.reachability.sourceContractReferencedBy?.length) console.log(`source-contract consumers: ${f.reachability.sourceContractReferencedBy.join(', ')}`);
  else if (f.deadIslandId) console.log(`no live root proof; member of ${f.deadIslandId}`);
  else console.log('no live root proof; isolated/unclassified from executable roots');
  const risky = [...(f.dependencies?.probableInternal||[]), ...(f.dependencies?.unresolved||[]), ...(f.dependencies?.internal||[]).filter((d)=>d.caseMismatch)];
  if (risky.length) console.log(`resolution evidence requiring review: ${JSON.stringify(risky, null, 2)}`);
}

function printResolution() {
  console.log(JSON.stringify({ resolution: map.resolution, health: {
    unresolvedStaticImports: map.summary.unresolvedStaticImports,
    unresolvedDynamicImports: map.summary.unresolvedDynamicImports,
    probableResolutions: map.summary.probableResolutions,
    caseMismatchResolutions: map.summary.caseMismatchResolutions,
    absoluteRuntimeImports: map.summary.absoluteRuntimeImports,
    deadClassificationTrusted: map.summary.deadClassificationTrusted,
  } }, null, 2));
}
function printUnresolved() {
  const rows = [];
  for (const f of map.files) {
    for (const d of f.dependencies?.unresolved || []) rows.push({ file:f.path, category:'unresolved', ...d });
    for (const d of f.dependencies?.probableInternal || []) rows.push({ file:f.path, category:'probable', ...d });
    for (const d of f.dependencies?.internal || []) if (d.caseMismatch) rows.push({ file:f.path, category:'case-mismatch', ...d });
    for (const d of f.dependencies?.external || []) if (d.resolution === 'external-absolute-runtime') rows.push({ file:f.path, category:'absolute-runtime', ...d });
  }
  if (JSON_MODE) { console.log(JSON.stringify(rows)); return; }
  let current = null;
  for (const row of rows) {
    if (row.file !== current) { current = row.file; console.log(`\n${current}`); }
    const { file, ...e } = row; console.log(`  ${JSON.stringify(e)}`);
  }
  console.log(`\nResolution-risk evidence: ${rows.length}`);
}

function printUnusedExports(pattern = '') {
  const re = pattern ? new RegExp(pattern, 'i') : null;
  const rows = (map.unusedExportCandidates || []).filter((x) => !re || re.test(x.file) || re.test(x.name));
  if (JSON_MODE) { console.log(JSON.stringify(rows)); return; }
  console.log(`Unused export candidates: ${rows.length} (advisory only; never automatic deletion proof)`);
  for (const row of rows) console.log(`${row.typeOnly ? 'type' : 'runtime'}\t${row.file}:${row.line || '?'}\t${row.name}\t${row.kind || ''}`);
}

function printLayers() {
  const counts = new Map();
  for (const f of map.files) {
    const row = counts.get(f.layer) || { layer: f.layer, files: 0, loc: 0, production: 0, dead: 0 };
    row.files++; row.loc += f.loc || 0;
    if (f.usageStatus === 'production-runtime' || f.usageStatus === 'production-type-only') row.production++;
    if (f.usageStatus === 'dead-island' || f.usageStatus === 'orphan') row.dead++;
    counts.set(f.layer, row);
  }
  const rows = [...counts.values()].sort((a,b) => b.files-a.files || a.layer.localeCompare(b.layer));
  if (JSON_MODE) { console.log(JSON.stringify(rows)); return; }
  for (const row of rows) console.log(`${row.layer}\tfiles=${row.files}\tloc=${row.loc}\tproduction=${row.production}\tdead=${row.dead}`);
}

function printGitHistory(p) {
  p = norm(p);
  try {
    const raw = execFileSync('git', ['log','--follow','--find-renames','--name-status','--format=@@%H|%aI|%an|%s','--',p], { cwd: ROOT, encoding:'utf8', stdio:['ignore','pipe','ignore'] }).trim();
    const commits = []; let cur = null;
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith('@@')) {
        if (cur) commits.push(cur);
        const [hash,date,author,...subject] = line.slice(2).split('|');
        cur = { hash, date, author, subject: subject.join('|'), changes: [] };
      } else if (line.trim() && cur) cur.changes.push(line.trim());
    }
    if (cur) commits.push(cur);
    if (JSON_MODE) console.log(JSON.stringify({ path:p, commits }));
    else if (!commits.length) console.log('(no git history available)');
    else for (const c of commits) { console.log(`${c.hash.slice(0,12)} ${c.date} ${c.author} ${c.subject}`); for (const ch of c.changes) console.log(`  ${ch}`); }
  } catch (err) {
    if (JSON_MODE) console.log(JSON.stringify({ path:p, commits:[], error:String(err.message).split('\n')[0] }));
    else console.log(`(no git history available: ${String(err.message).split('\n')[0]})`);
  }
}

function printHistory(p) {
  p = norm(p); if (!fs.existsSync(DB)) { console.error('History database missing. Run: npm run index:app'); process.exit(1); }
  const db = new DatabaseSync(DB, { readOnly: true });
  const current = db.prepare('SELECT file_id FROM files WHERE current_path=?').get(p);
  let ids = current ? [current.file_id] : db.prepare('SELECT DISTINCT file_id FROM file_versions WHERE path=?').all(p).map((x)=>x.file_id);
  ids = [...new Set(ids)];
  if (!ids.length) { console.error(`No history for: ${p}`); db.close(); process.exit(1); }
  for (const id of ids) {
    console.log(`file_id=${id}`);
    const versions = db.prepare(`SELECT fv.snapshot_id,s.created_at,fv.path,fv.hash,fv.layer,fv.usage_status,fv.symbol_count FROM file_versions fv JOIN snapshots s ON s.snapshot_id=fv.snapshot_id WHERE fv.file_id=? ORDER BY fv.snapshot_id`).all(id);
    for (const v of versions) console.log(`  #${v.snapshot_id} ${v.created_at} ${v.path} ${v.usage_status} ${v.hash.slice(0,12)} symbols=${v.symbol_count}`);
    const moves = db.prepare('SELECT snapshot_id,old_path,new_path,detection,confidence,details FROM moves WHERE file_id=? ORDER BY snapshot_id').all(id);
    for (const m of moves) console.log(`  MOVE #${m.snapshot_id}: ${m.old_path} -> ${m.new_path} [${m.detection} confidence=${m.confidence}]`);
    const changes = db.prepare('SELECT snapshot_id,change_type,old_path,new_path,old_hash,new_hash,details FROM changes WHERE file_id=? ORDER BY snapshot_id').all(id);
    for (const c of changes) console.log(`  CHANGE #${c.snapshot_id}: ${c.change_type} ${c.old_path||'-'} -> ${c.new_path||'-'} ${c.old_hash?c.old_hash.slice(0,10):'-'} -> ${c.new_hash?c.new_hash.slice(0,10):'-'}`);
  }
  db.close();
  try {
    const gitLog = execFileSync('git', ['log', '--follow', '--name-status', '--format=commit %H %aI %s', '--', p], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    if (gitLog) console.log(`\nGit --follow history:\n${gitLog}`);
  } catch {}
}

switch (mode) {
  case '--file': if (!rest[0]) throw new Error('--file requires a path'); printFile(rest[0]); break;
  case '--folder': printFolder(rest[0] || '.'); break;
  case '--dead': printDead(); break;
  case '--layer': if (!rest[0]) throw new Error('--layer requires a regex'); printLayer(rest[0]); break;
  case '--symbol': if (!rest[0]) throw new Error('--symbol requires a regex'); printSymbol(rest[0]); break;
  case '--history': if (!rest[0]) throw new Error('--history requires a path'); printHistory(rest[0]); break;
  case '--git-history': if (!rest[0]) throw new Error('--git-history requires a path'); printGitHistory(rest[0]); break;
  case '--unused-exports': printUnusedExports(rest[0] || ''); break;
  case '--layers': printLayers(); break;
  case '--why': if (!rest[0]) throw new Error('--why requires a path'); printWhy(rest[0]); break;
  case '--resolution': printResolution(); break;
  case '--unresolved': printUnresolved(); break;
  default:
    console.log(JSON.stringify({ generatedAt:map.generatedAt, rootHash:map.rootHash, summary:map.summary, roots:map.roots, history:map.history }, null, 2));
    console.log('\nUsage: --file <path> | --folder <path> | --dead | --layer <regex> | --layers | --symbol <regex> | --unused-exports [regex] | --history <path> | --git-history <path> | --why <path> | --resolution | --unresolved [--json]');
}
