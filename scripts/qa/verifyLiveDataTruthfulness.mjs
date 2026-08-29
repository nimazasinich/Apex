// Permanent guard against the "fabricate market/strategy data and label it
// live" anti-pattern that the Trading Lab Preview feature introduced
// (see APEX_SYSTEM_HANDOFF.md, Section 2). Fails the build if any of the
// removed identifiers, or the specific fabricated values they produced,
// reappear anywhere under src/. Fixtures, stories, and tests are exempt —
// fabricated-but-labeled data belongs only in tests/**/fixtures/** or
// **/*.stories.*, never in shipped component code.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

const FORBIDDEN_PATTERNS = [
  'TRADING_LAB_PREVIEW_ENABLED',
  'TRADING_LAB',
  'buildTradingLabPreview',
  'buildTradingLabDepth',
  'buildTradingLabCandles',
  'LAB_PREVIEW',
  'lab-preview',
  'lab_preview',
  'Momentum Breakout',
  'momentum-breakout-lab',
];

/** @type {{ file: string; pattern: string; line: number }[]} */
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test/story directories nested under src/ are exempt: fixtures for
      // visual QA are expected to construct "fully populated" data there.
      if (entry.name === '__tests__' || entry.name === '__stories__' || entry.name === 'fixtures') continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.name)) continue;
    if (/\.(test|spec|stories)\.[jt]sx?$/.test(entry.name)) continue;

    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');
    for (const pattern of FORBIDDEN_PATTERNS) {
      lines.forEach((lineText, index) => {
        if (lineText.includes(pattern)) {
          violations.push({ file: path.relative(root, full), pattern, line: index + 1 });
        }
      });
    }
  }
}

if (fs.existsSync(srcDir)) {
  walk(srcDir);
} else {
  console.error(`verifyLiveDataTruthfulness: src/ directory not found at ${srcDir}`);
  process.exitCode = 1;
}

if (violations.length > 0) {
  console.error('verifyLiveDataTruthfulness: FAILED');
  console.error('Fabricated-data identifiers found outside tests/fixtures — production code must never be able to label synthetic data as live:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} contains "${v.pattern}"`);
  }
  console.error('\nIf this is legitimate fixture/story data, move it under tests/fixtures/ or a *.stories.* file, and inject it at the composition root (Storybook) or the network layer (Playwright route mocking) — never inside shipped component code.');
  process.exitCode = 1;
} else {
  console.log(`verifyLiveDataTruthfulness: PASSED (0 matches for ${FORBIDDEN_PATTERNS.length} forbidden patterns under src/)`);
}
