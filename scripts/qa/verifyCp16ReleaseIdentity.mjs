import assert from 'node:assert/strict';
import fs from 'node:fs';

const info = JSON.parse(fs.readFileSync('public/build-info.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const generator = fs.readFileSync('scripts/utilities/generateBuildIdentity.mjs', 'utf8');
const shell = fs.readFileSync('src/components/workspace/WorkspaceShell.tsx', 'utf8');

assert.equal(info.version, pkg.version);
assert.equal(info.gitCommit, 'NOT_AVAILABLE_SOURCE_ARCHIVE');
assert.equal(info.dirtyTree, 'NOT_APPLICABLE');
assert.equal(info.parentArtifactSha256, '36e22cb8cbd584264da29bd4ae029a6847898b5e7693dd0d62ff1a6b6ce08ce7');
assert.equal(info.parentBuildId, 'apex-2.0.1-f74c0bbe625c');
assert.equal(info.sourceTreeHash.length, 64);
assert.equal(info.sourceHash, info.sourceTreeHash.slice(0, 12));
assert.equal(info.buildId, `apex-${pkg.version}-${info.sourceHash}`);
assert.match(generator, /const buildId = `apex-\$\{pkg\.version\}-\$\{sourceHash\}`/);
assert.match(shell, /build-info\.json/);
assert.match(shell, /apex-build-identity/);
console.log('CP16 release/build identity acceptance: PASS');
