import path from 'node:path';

function sketchSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length && !b.length) return 1;
  const count = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const ca = count(a), cb = count(b);
  let common = 0;
  for (const [token, n] of ca) common += Math.min(n, cb.get(token) || 0);
  return (2 * common) / Math.max(1, a.length + b.length);
}

function setJaccard(a, b) {
  const A = new Set(a || []), B = new Set(b || []);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, A.size + B.size - inter);
}

/**
 * Assign stable file identities across one App Index snapshot transition.
 *
 * Certainty policy:
 * - same path -> same identity
 * - unique identical SHA-256 relocation -> certain move (confidence 1.0)
 * - rename+edit -> probable move only when persisted line/symbol similarity clears
 *   conservative thresholds and the best candidate is unambiguous
 * - unrelated add/delete pairs remain separate; probable lineage is never invented
 */
export function detectFileLineage({ previousRows, previousSymbolsByFileId, currentFiles, createFileId }) {
  const prevByPath = new Map(previousRows.map((r) => [r.path, r]));
  const currentPaths = new Set(currentFiles.map((f) => f.path));
  const removed = previousRows.filter((r) => !currentPaths.has(r.path));
  const removedByHash = new Map();
  for (const r of removed) {
    const arr = removedByHash.get(r.hash) || [];
    arr.push(r);
    removedByHash.set(r.hash, arr);
  }

  const changes = [];
  const moves = [];
  const assignments = new Map();
  const usedRemoved = new Set();

  for (const f of currentFiles) {
    const prev = prevByPath.get(f.path);
    if (prev) {
      assignments.set(f.path, prev.file_id);
      if (prev.hash !== f.hash) {
        changes.push({ fileId: prev.file_id, type: 'modified', oldPath: f.path, newPath: f.path, oldHash: prev.hash, newHash: f.hash, details: null });
      }
      continue;
    }
    const exact = (removedByHash.get(f.hash) || []).filter((r) => !usedRemoved.has(r.file_id));
    if (exact.length === 1) {
      const r = exact[0];
      usedRemoved.add(r.file_id);
      assignments.set(f.path, r.file_id);
      const move = {
        fileId: r.file_id,
        oldPath: r.path,
        newPath: f.path,
        detection: 'exact-content-hash',
        confidence: 1.0,
        details: 'Path changed while file SHA-256 remained identical.',
      };
      moves.push(move);
      changes.push({ fileId: r.file_id, type: 'moved', oldPath: r.path, newPath: f.path, oldHash: r.hash, newHash: f.hash, details: move.details });
    }
  }

  const unmatchedRemoved = removed.filter((r) => !usedRemoved.has(r.file_id));
  const unmatchedAdded = currentFiles.filter((f) => !prevByPath.has(f.path) && !assignments.has(f.path) && Array.isArray(f.lineSketch));
  for (const f of unmatchedAdded) {
    const scored = [];
    for (const r of unmatchedRemoved) {
      if (usedRemoved.has(r.file_id) || path.extname(r.path) !== path.extname(f.path) || !r.line_sketch) continue;
      try {
        const lineScore = sketchSimilarity(JSON.parse(r.line_sketch), f.lineSketch);
        const prevSymbols = previousSymbolsByFileId.get(r.file_id) || [];
        const currentSymbols = (f.symbols || []).map((sym) => `${sym.kind || ''}:${sym.qualname}`);
        const symbolScore = setJaccard(prevSymbols, currentSymbols);
        const combined = Math.max(lineScore, symbolScore >= 0.80 && lineScore >= 0.40 ? (0.6 * symbolScore + 0.4 * lineScore) : 0);
        if (lineScore >= 0.90 || combined >= 0.78) scored.push({ row: r, score: combined || lineScore, lineScore, symbolScore });
      } catch {}
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0], second = scored[1];
    if (best && (!second || best.score - second.score >= 0.05)) {
      usedRemoved.add(best.row.file_id);
      assignments.set(f.path, best.row.file_id);
      const detection = best.lineScore >= 0.90 ? 'line-similarity-probable' : 'symbol+line-similarity-probable';
      const move = {
        fileId: best.row.file_id,
        oldPath: best.row.path,
        newPath: f.path,
        detection,
        confidence: best.score,
        details: `Probable move from persisted similarity (line=${best.lineScore.toFixed(3)}, symbol=${best.symbolScore.toFixed(3)}); validate with Git history when available.`,
      };
      moves.push(move);
      changes.push({ fileId: best.row.file_id, type: 'probable-move', oldPath: best.row.path, newPath: f.path, oldHash: best.row.hash, newHash: f.hash, details: move.details });
    }
  }

  for (const f of currentFiles) {
    if (!assignments.has(f.path)) {
      const id = createFileId();
      assignments.set(f.path, id);
      changes.push({ fileId: id, type: 'added', oldPath: null, newPath: f.path, oldHash: null, newHash: f.hash, details: null });
    }
  }
  for (const r of removed) {
    if (!usedRemoved.has(r.file_id)) {
      changes.push({ fileId: r.file_id, type: 'deleted', oldPath: r.path, newPath: null, oldHash: r.hash, newHash: null, details: null });
    }
  }

  return { assignments, changes, moves };
}
