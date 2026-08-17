import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePrivateJsonFileSync } from '../services/privateConfigFile';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('private configuration persistence', () => {
  it('replaces an existing JSON file without leaving temporary files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'apex-private-config-'));
    directories.push(directory);
    const target = join(directory, 'config', 'secrets.json');

    writePrivateJsonFileSync(target, { token: 'first' });
    writePrivateJsonFileSync(target, { token: 'second', enabled: true });

    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ token: 'second', enabled: true });
    expect(readdirSync(join(directory, 'config')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    if (process.platform !== 'win32') expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});
