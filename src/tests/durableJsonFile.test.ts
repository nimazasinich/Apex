import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDurableJsonFileSync, restoreDurableJsonBackupSync, writeDurableJsonFileSync } from '../services/durableJsonFile';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function file() { const root = mkdtempSync(join(tmpdir(), 'apex-durable-')); roots.push(root); return join(root, 'state.json'); }

describe('durableJsonFile', () => {
  it('commits JSON atomically and retains an explicit rollback backup', () => {
    const target = file();
    writeDurableJsonFileSync(target, { revision: 1 });
    writeDurableJsonFileSync(target, { revision: 2 });
    expect(readDurableJsonFileSync(target)).toEqual({ revision: 2 });
    expect(JSON.parse(readFileSync(`${target}.bak`, 'utf8'))).toEqual({ revision: 1 });
    restoreDurableJsonBackupSync(target);
    expect(readDurableJsonFileSync(target)).toEqual({ revision: 1 });
  });

  it('fails closed on corrupt JSON instead of silently treating it as empty state', () => {
    const target = file();
    writeFileSync(target, '{bad-json', 'utf8');
    expect(() => readDurableJsonFileSync(target)).toThrow('durable_json_corrupt');
  });

  it('rejects oversized state before replacing the committed file', () => {
    const target = file();
    writeDurableJsonFileSync(target, { safe: true });
    expect(() => writeDurableJsonFileSync(target, { data: 'x'.repeat(4096) }, { maxBytes: 1024 })).toThrow('durable_json_capacity_exceeded');
    expect(readDurableJsonFileSync(target)).toEqual({ safe: true });
  });
});
