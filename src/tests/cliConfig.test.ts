import { describe, expect, it } from 'vitest';
import { getCliValue, resolveHost, resolvePort } from '../utils/cliConfig';

describe('cliConfig', () => {
  it('parses --port and --host from the CLI argv', () => {
    const args = ['--port', '4100', '--host', '0.0.0.0'];
    expect(getCliValue(args, 'port')).toBe('4100');
    expect(getCliValue(args, 'host')).toBe('0.0.0.0');
    expect(resolvePort(args, {})).toBe(4100);
    expect(resolveHost(args, {})).toBe('0.0.0.0');
  });

  it('falls back to env and defaults', () => {
    expect(resolvePort(['--port=bogus'], { PORT: '4201' })).toBe(3000);
    expect(resolvePort([], { PORT: '4202' })).toBe(4202);
    expect(resolveHost([], { HOST: 'localhost' })).toBe('localhost');
    expect(resolveHost([], {})).toBe('127.0.0.1');
  });
});
