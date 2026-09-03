#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { detectFileLineage } from '../utilities/app-index/lineage.mjs';

let failures = 0;
let checks = 0;
function check(name, fn) {
  checks++;
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}: ${err?.message || err}`);
  }
}

function sketch(text) {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5000)
    .map((line) => crypto.createHash('sha256').update(line).digest('hex').slice(0, 16));
}
function row({ id, path, hash, text }) {
  return { file_id: id, path, hash, line_sketch: JSON.stringify(sketch(text)) };
}
function file({ path, hash, text, symbols = [] }) {
  return { path, hash, lineSketch: sketch(text), symbols };
}
function run(previousRows, currentFiles, previousSymbolsByFileId = new Map()) {
  let seq = 0;
  return detectFileLineage({
    previousRows,
    previousSymbolsByFileId,
    currentFiles,
    createFileId: () => `new_${++seq}`,
  });
}

const contentA = Array.from({ length: 40 }, (_, i) => `const line${i} = ${i};`).join('\n');
const contentAEdited = contentA.split('\n').map((line, i) => i < 2 ? `const line${i} = ${i * 100}; // edited` : line).join('\n');
const unrelated = Array.from({ length: 40 }, (_, i) => `function unrelated${i}() { return ${i}; }`).join('\n');

console.log('[app-index-lineage] canonical lineage regression scenarios');

{
  const result = run([], [file({ path: 'src/a.mjs', hash: 'hash-A', text: contentA })]);
  check('fresh file is added with a new identity', () => {
    assert.equal(result.assignments.get('src/a.mjs'), 'new_1');
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].type, 'added');
    assert.equal(result.moves.length, 0);
  });
}

{
  const previous = [row({ id: 'file-A', path: 'src/a.mjs', hash: 'hash-A', text: contentA })];
  const result = run(previous, [file({ path: 'src/lib/a.mjs', hash: 'hash-A', text: contentA })]);
  check('unique identical-hash relocation preserves file_id', () => {
    assert.equal(result.assignments.get('src/lib/a.mjs'), 'file-A');
    assert.equal(result.moves.length, 1);
    assert.equal(result.moves[0].detection, 'exact-content-hash');
    assert.equal(result.moves[0].confidence, 1);
  });
}

{
  const previous = [row({ id: 'file-A', path: 'src/lib/a.mjs', hash: 'hash-A', text: contentA })];
  const result = run(previous, [file({ path: 'src/lib/b.mjs', hash: 'hash-B', text: contentAEdited })]);
  check('rename+edit is probable lineage, not a certain move', () => {
    assert.equal(result.assignments.get('src/lib/b.mjs'), 'file-A');
    assert.equal(result.moves.length, 1);
    assert.match(result.moves[0].detection, /-probable$/);
    assert.ok(result.moves[0].confidence >= 0.78 && result.moves[0].confidence < 1);
    assert.equal(result.changes[0].type, 'probable-move');
  });
}

{
  const previous = [row({ id: 'file-OLD', path: 'src/old.mjs', hash: 'hash-OLD', text: contentA })];
  const result = run(previous, [file({ path: 'src/new.mjs', hash: 'hash-NEW', text: unrelated })]);
  check('unrelated add/delete are never fabricated into a rename', () => {
    assert.equal(result.moves.length, 0);
    assert.deepEqual(result.changes.map((x) => x.type).sort(), ['added', 'deleted']);
    assert.notEqual(result.assignments.get('src/new.mjs'), 'file-OLD');
  });
}

{
  const previous = [row({ id: 'file-A', path: 'src/a.mjs', hash: 'hash-A', text: contentA })];
  const result = run(previous, [file({ path: 'src/a.mjs', hash: 'hash-B', text: contentAEdited })]);
  check('same-path modification preserves identity and records modified', () => {
    assert.equal(result.assignments.get('src/a.mjs'), 'file-A');
    assert.equal(result.moves.length, 0);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].type, 'modified');
  });
}

{
  const previous = [
    row({ id: 'file-A', path: 'src/a.mjs', hash: 'hash-A', text: contentA }),
    row({ id: 'file-B', path: 'src/b.mjs', hash: 'hash-B', text: contentA }),
  ];
  const result = run(previous, [file({ path: 'src/c.mjs', hash: 'hash-C', text: contentAEdited })]);
  check('ambiguous near-identical candidates do not invent probable lineage', () => {
    assert.equal(result.moves.length, 0);
    assert.equal(result.assignments.get('src/c.mjs'), 'new_1');
    assert.deepEqual(result.changes.map((x) => x.type).sort(), ['added', 'deleted', 'deleted']);
  });
}

console.log(`[app-index-lineage] ${checks - failures}/${checks} PASS`);
process.exit(failures ? 1 : 0);
