#!/usr/bin/env node
/** Remove regenerated QA, indexing, visual-documentation and local release artifacts. */
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = [
  '.agent-index',
  '.apex-index',
  'QA',
  '_qa',
  '_release',
  'Doc/generated/APEX_COMPLETE_VISUAL_PROJECT_DOCUMENTATION.html',
  'Doc/FUNCTION_INDEX.md',
  'Doc/FUNCTION_INDEX.json',
  'Doc/DOCUMENTATION_INDEX.md',
  'Doc/DOCUMENTATION_INDEX.json',
];

for (const target of targets) {
  const full = resolve(root, target);
  if (!existsSync(full)) continue;
  rmSync(full, { recursive: true, force: true });
  console.log(`[clean:artifacts] removed ${target}`);
}
