import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

for (const target of ['dist', 'server.js']) {
  rmSync(resolve(process.cwd(), target), { recursive: true, force: true });
  console.log(`removed ${target}`);
}
