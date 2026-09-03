import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const requireFromHere = createRequire(import.meta.url);

/**
 * Load the TypeScript runtime without embedding machine-specific absolute paths.
 * Normal project execution should resolve the package from node_modules. The
 * global npm lookup exists only so source QA can remain runnable in constrained
 * analysis environments where dependencies are not materialized locally.
 */
export function loadTypeScript() {
  try { return requireFromHere('typescript'); } catch {}

  const explicit = process.env.APEX_TYPESCRIPT_RUNTIME;
  if (explicit && fs.existsSync(explicit)) return requireFromHere(path.resolve(explicit));

  const local = path.resolve('node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return requireFromHere(local);

  try {
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const globalRoot = execFileSync(npmBin, ['root', '-g'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return requireFromHere(globalTs);
  } catch {}

  throw new Error('typescript_runtime_unavailable: run npm ci or set APEX_TYPESCRIPT_RUNTIME');
}
