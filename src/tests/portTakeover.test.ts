import { describe, expect, it } from 'vitest';
import { commandBelongsToApex, parseWindowsListeningPids } from '../../scripts/utilities/portTakeover.mts';

describe('port takeover safety', () => {
  it('extracts only listening PIDs for the requested port', () => {
    const output = [
      '  TCP    127.0.0.1:3000       0.0.0.0:0       LISTENING       4321',
      '  TCP    127.0.0.1:3001       0.0.0.0:0       LISTENING       8765',
      '  TCP    [::1]:3000           [::]:0          LISTENING       4321',
      '  TCP    127.0.0.1:3000       127.0.0.1:50000 ESTABLISHED     9999',
    ].join('\r\n');
    expect(parseWindowsListeningPids(output, 3000)).toEqual([4321]);
  });

  it('accepts the current workspace server command', () => {
    const root = 'C:\\project\\APEX\\apex-unified-terminal';
    const command = 'node --import loader.mjs C:\\project\\APEX\\apex-unified-terminal\\server.ts --port 3000';
    expect(commandBelongsToApex(command, root)).toBe(true);
  });

  it('rejects an unrelated server on the same port', () => {
    const root = 'C:\\project\\APEX\\apex-unified-terminal';
    expect(commandBelongsToApex('node C:\\other-app\\server.ts --port 3000', root)).toBe(false);
  });
});
