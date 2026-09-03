/**
 * APEX Research Agent — scaffold a new study file.
 *
 * Generates scripts/research/run<Name>Study.mts from the shared template
 * (lib/studyTemplate.mts) and, unless --no-queue is passed, appends a
 * matching entry to study-queue.json with status "draft" — a status the
 * runner recognizes but never picks up on its own. You fill in the real
 * logic, then flip that entry's status to "queued" yourself when it's
 * actually ready to run. This keeps the same human-in-the-loop property as
 * everything else here: creating a scaffold can never cause anything to
 * execute.
 *
 * Run with:
 *   npx tsx scripts/research-agent/scaffoldStudy.mts \
 *     --id candidate-7-funding-carry \
 *     --name FundingCarry \
 *     --hypothesis "Cross-exchange funding-rate carry, conditioned on OI"
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { renderStudyTemplate } from './lib/studyTemplate.mts';
import { assertCandidateId, assertSafeHypothesisText } from './lib/researchAgentSafety.mts';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const queuePath = path.join(agentDir, 'study-queue.json');
const researchDir = path.join(root, 'scripts/research');

function parseArgs(): { id: string | null; name: string | null; hypothesis: string | null; noQueue: boolean } {
  const args = process.argv.slice(2);
  let id: string | null = null;
  let name: string | null = null;
  let hypothesis: string | null = null;
  let noQueue = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') id = args[++i] ?? null;
    else if (args[i] === '--name') name = args[++i] ?? null;
    else if (args[i] === '--hypothesis') hypothesis = args[++i] ?? null;
    else if (args[i] === '--no-queue') noQueue = true;
  }
  return { id, name, hypothesis, noQueue };
}

function main(): void {
  const { id, name, hypothesis, noQueue } = parseArgs();
  if (!id || !name || !hypothesis) {
    console.error(
      'Usage: npx tsx scripts/research-agent/scaffoldStudy.mts --id <candidate-id> --name <PascalCaseName> --hypothesis "<one-line description>" [--no-queue]',
    );
    process.exit(1);
  }
  try {
    assertCandidateId(id);
    assertSafeHypothesisText(hypothesis);
  } catch (error) {
    console.error(`[BLOCKED] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
    console.error(`--name must be a bare PascalCase identifier (letters/digits only, no spaces). Got: "${name}"`);
    process.exit(1);
  }

  const scriptRelPath = `scripts/research/run${name}Study.mts`;
  const scriptAbsPath = path.join(root, scriptRelPath);
  if (existsSync(scriptAbsPath)) {
    console.error(`[BLOCKED] ${scriptRelPath} already exists — not overwriting. Pick a different --name or edit it by hand.`);
    process.exit(1);
  }

  mkdirSync(researchDir, { recursive: true });
  writeFileSync(scriptAbsPath, renderStudyTemplate({ id, hypothesis, studyName: name }), 'utf8');
  console.log(`[research-agent] Wrote scaffold: ${scriptRelPath}`);

  if (noQueue) {
    console.log('[research-agent] --no-queue: not touching study-queue.json.');
    return;
  }

  if (!existsSync(queuePath)) {
    console.warn(`[research-agent] study-queue.json not found at ${queuePath} — skipping queue entry. Add one by hand.`);
    return;
  }
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  if (!Array.isArray(queue.studies)) {
    console.warn('[research-agent] study-queue.json has no "studies" array — skipping queue entry. Add one by hand.');
    return;
  }
  if (queue.studies.some((s: { id: string }) => s.id === id)) {
    console.warn(`[research-agent] study-queue.json already has an entry with id "${id}" — not adding a duplicate. Edit it by hand if needed.`);
    return;
  }
  queue.studies.push({
    id,
    script: scriptRelPath,
    hypothesis,
    status: 'draft', // NOT "queued" — runQueuedStudies.mts will never pick this up until you change it yourself
  });
  writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
  console.log(`[research-agent] Added "draft" entry for "${id}" to study-queue.json (status: draft, not queued).`);
  console.log(`[research-agent] Next: implement runStudy() in ${scriptRelPath}, then change its queue status to "queued" when ready.`);
}

main();
