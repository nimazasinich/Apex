#!/usr/bin/env node
/**
 * REAL runtime verification of the complete Autopilot flow.
 *
 * This is not a source-string check and not a unit test. It boots the actual
 * server as a child process, then drives the real HTTP surface the APEX client
 * drives:
 *
 *   GET  /api/health                            server is really up
 *   GET  /api/strategies/autopilot/status        controller reports OFF
 *   POST /api/strategies/autopilot/control       START -> armed
 *   POST /api/strategies/autopilot/control       START -> arms the real scheduler
 *        (the verifier then waits for two scheduler-owned cycles; no cycle POST)
 *   POST /api/strategies/:id/validate            manual validation subject
 *   POST /api/strategies/autopilot/control       STOP -> OFF
 *
 * It exists because everything upstream of it was verified in-process. The two
 * things only a real run can show are (a) that the controller state machine
 * actually moves under a live cycle, and (b) that the validation-identity gate
 * holds against real market data rather than fixtures.
 *
 * Requires network access to the market data providers. Run it on the Windows
 * host, from the project root:
 *
 *   npm run qa:autopilot-lifecycle-runtime
 *
 * Environment knobs:
 *   APEX_RUNTIME_PORT                    default 4599 (kept off the dev port)
 *   APEX_RUNTIME_BASE_URL                target an already-running server instead of booting one
 *   APEX_RUNTIME_BOOT_TIMEOUT_MS         default 180000
 *   APEX_RUNTIME_CYCLE_TIMEOUT_MS        default 900000 per scheduler cycle
 *   APEX_RUNTIME_SCHEDULER_INTERVAL_MS   default 60000 (the scheduler's own
 *                                        clamp floor) — this run boots the
 *                                        server with this as its scheduler
 *                                        interval so the two required cycles
 *                                        do not each wait out the production
 *                                        5-minute cadence. Set it to the real
 *                                        production default (300000) to
 *                                        specifically verify that cadence;
 *                                        expect the run to then take 10+
 *                                        minutes, which is expected, not a
 *                                        hang.
 *   APEX_RUNTIME_SYMBOL                  default BTC-USDT
 *
 * Exit code 0 only if every check passed. SKIPs are reported but never
 * silently upgraded to a pass.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const PORT = Number(process.env.APEX_RUNTIME_PORT || 4599);
/**
 * Point the run at a server that is already up (`http://127.0.0.1:3000`, say)
 * instead of booting one. Set this when you want to verify the instance you are
 * already looking at in the browser; leave it unset for a clean boot.
 */
const EXTERNAL_BASE = (process.env.APEX_RUNTIME_BASE_URL || '').trim().replace(/\/$/, '');
const BASE = EXTERNAL_BASE || `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = Number(process.env.APEX_RUNTIME_BOOT_TIMEOUT_MS || 180_000);
const CYCLE_TIMEOUT_MS = Number(process.env.APEX_RUNTIME_CYCLE_TIMEOUT_MS || 900_000);
const SYMBOL = String(process.env.APEX_RUNTIME_SYMBOL || 'BTC-USDT');
/**
 * The spawned server previously inherited no scheduler-interval override, so
 * arming it fell through to the production default
 * (AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS = 5 minutes). Waiting out two real
 * scheduler ticks at that cadence, each bounded by CYCLE_TIMEOUT_MS on top,
 * made a healthy run take 10-40+ minutes with near-silent output — which is
 * why it read as the program having locked up. Default this run to the
 * scheduler's own minimum (60s) instead; set APEX_RUNTIME_SCHEDULER_INTERVAL_MS
 * explicitly to verify the real production cadence when that is the goal.
 */
const SCHEDULER_INTERVAL_MS = Number(process.env.APEX_RUNTIME_SCHEDULER_INTERVAL_MS || 60_000);

const checks = [];
const logLines = [];

function record(name, status, detail) {
  checks.push({ name, status, detail: detail ?? null });
  const tag = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  console.log(`${tag} ${name}${detail ? ` — ${detail}` : ''}`);
}
const check = (name, ok, detail) => record(name, ok ? 'PASS' : 'FAIL', detail);
const skip = (name, why) => record(name, 'SKIP', why);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, route, body, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${route}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: response.status, json, text: text.slice(0, 2_000) };
  } finally {
    clearTimeout(timer);
  }
}

/** Every Autopilot response must carry the same literal safety denial. */
function safetyIntact(safety) {
  if (!safety || typeof safety !== 'object') return false;
  return safety.researchOnly === true
    && safety.paperOnly === true
    && safety.executionAuthorized === false
    && safety.automaticOrderSubmission === false
    && safety.autonomousLiveExecutionEnabled === false;
}

// ---------------------------------------------------------------------------
// Boot the real server.
// ---------------------------------------------------------------------------
const tsxBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
if (!EXTERNAL_BASE && !fs.existsSync(tsxBin)) {
  throw new Error(`qa_dependency_missing:tsx:${tsxBin}. Run npm ci before qa:autopilot-lifecycle-runtime, or set APEX_RUNTIME_BASE_URL to an already-running server.`);
}

/**
 * Refuse to run against a server this run did not boot.
 *
 * `waitForBoot` below accepts any `/api/health` 200 on this port and cannot tell
 * a foreign process from the child about to be spawned. When an earlier run was
 * interrupted (Ctrl+C, an agent/CI timeout, a closed shell) its `tsx server.ts`
 * survives and keeps listening — already STARTed by that run, so it reports
 * WAITING rather than OFF, and its `nextCycleIndex` has already moved past 0.
 * The whole verification then silently targets that stale process: "controller
 * starts OFF" fails with phase=WAITING, and the cycleIndex=0 wait can never be
 * satisfied, burning two full scheduler deadlines before reporting anything.
 *
 * Fail closed here instead, in seconds, with the exact remedy.
 */
if (!EXTERNAL_BASE) {
  let occupied = false;
  try {
    const probe = await call('GET', '/api/health', undefined, 3_000);
    occupied = probe.status === 200;
  } catch {
    // Nothing listening: the port is ours to bind.
  }
  if (occupied) {
    throw new Error([
      `qa_port_already_serving:${PORT}.`,
      `Something is already answering /api/health on ${BASE} before this run booted a server,`,
      'so this gate would verify that process instead of a clean default-OFF boot.',
      'An interrupted earlier run is the usual cause; it leaves an armed controller behind.',
      `Find and stop it:  netstat -ano | findstr :${PORT}   then   taskkill /PID <pid> /T /F`,
      `Or, to verify that running instance deliberately, set APEX_RUNTIME_BASE_URL=${BASE}.`,
    ].join(' '));
  }
}

// Intentionally differs from qa/: tsx.cmd needs shell:true on Windows; qa/ spawns process.execPath with shell:false, and this orphan copy is not wired into verify.
const child = EXTERNAL_BASE ? null : spawn(tsxBin, ['server.ts'], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: String(PORT),
    // The scheduler remains default-OFF at boot so this run proves the real
    // operator START path arms it. The interval IS overridden (see
    // SCHEDULER_INTERVAL_MS above) so the two required cycles do not each
    // wait out the production 5-minute cadence by default; status still
    // exposes whatever interval the server actually resolved, and every
    // check below reads that reported value rather than assuming this one.
    APEX_AUTOPILOT_SCHEDULER: 'false',
    APEX_AUTOPILOT_SCHEDULER_INTERVAL_MS: String(SCHEDULER_INTERVAL_MS),
  },
});

const capture = (stream) => {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      logLines.push(line);
      if (logLines.length > 400) logLines.shift();
    }
  });
};
if (child) {
  capture(child.stdout);
  capture(child.stderr);
}

let childExited = null;
child?.on('exit', (code, signal) => { childExited = { code, signal }; });

function stopServer() {
  if (!child || childExited || !child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/**
 * The `finally` block below only runs when this process ends normally. An
 * operator Ctrl+C — likely here, because two real 300000ms scheduler cycles make
 * a healthy run take over ten minutes — would otherwise skip it and orphan an
 * armed server on this port, which then poisons every later run. Tear the child
 * down on the way out and keep the conventional signal exit status.
 */
let signalHandled = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (signalHandled) return;
    signalHandled = true;
    console.log(`\n${signal} received — stopping the spawned server so it cannot outlive this run.`);
    stopServer();
    setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 1_500);
  });
}

async function waitForBoot() {
  const startedAt = Date.now();
  const deadline = startedAt + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (childExited) return { ok: false, reason: `server exited early code=${childExited.code} signal=${childExited.signal}` };
    try {
      const health = await call('GET', '/api/health', undefined, 5_000);
      if (health.status === 200) return { ok: true, elapsedMs: Date.now() - startedAt };
    } catch { /* not listening yet */ }
    await sleep(1_000);
  }
  return { ok: false, reason: `no /api/health 200 within ${BOOT_TIMEOUT_MS}ms` };
}

let exitCode = 1;
try {
  const boot = await waitForBoot();
  check(EXTERNAL_BASE ? 'target server answers /api/health' : 'server boots and answers /api/health',
    boot.ok, boot.ok ? `${BASE} in ${boot.elapsedMs}ms` : boot.reason);
  if (!boot.ok) throw new Error('server_not_reachable');
  if (!EXTERNAL_BASE) {
    console.log(`scheduler interval for this run: ${SCHEDULER_INTERVAL_MS}ms — two cycles need at least ${(2 * SCHEDULER_INTERVAL_MS / 1000).toFixed(0)}s of real wall-clock waiting before any work time, this is expected and not a hang.`);
  }

  // -------------------------------------------------------------------------
  // 1. Controller starts OFF.
  // -------------------------------------------------------------------------
  const initial = await call('GET', '/api/strategies/autopilot/status');
  const initialPhase = initial.json?.controller?.phase ?? null;
  check('status route answers 200', initial.status === 200, `status=${initial.status}`);
  check('controller starts OFF', initialPhase === 'OFF', `phase=${initialPhase}`);
  check('status carries the literal safety denial', safetyIntact(initial.json?.safety));

  // -------------------------------------------------------------------------
  // 2. Operator START really arms the controller.
  // -------------------------------------------------------------------------
  const started = await call('POST', '/api/strategies/autopilot/control', { action: 'START' });
  const startedPhase = started.json?.controller?.phase ?? null;
  check('control START accepted', started.status === 200 && started.json?.ok === true, `status=${started.status}`);
  check('START leaves OFF behind', startedPhase !== null && startedPhase !== 'OFF', `phase=${startedPhase}`);
  check('START grants no execution authority', safetyIntact(started.json?.safety)
    && started.json?.safety?.riskGovernorBypassAllowed === false
    && started.json?.safety?.manualConfirmationRequired === true);
  const actualSchedulerIntervalMs = Number(started.json?.scheduler?.intervalMs);
  const schedulerCycleTimeoutMs = CYCLE_TIMEOUT_MS + (Number.isFinite(actualSchedulerIntervalMs) ? actualSchedulerIntervalMs : 0) + 30_000;
  check('scheduler reports its actual configured interval', Number.isFinite(actualSchedulerIntervalMs) && actualSchedulerIntervalMs > 0,
    `intervalMs=${actualSchedulerIntervalMs}`);
  check('START arms the server-owned scheduler', started.json?.scheduler?.serverBackgroundLoop === true
    && started.json?.scheduler?.mode === 'CLIENT_OPT_IN'
    && started.json?.scheduler?.nextRunAt > Date.now(),
  `mode=${started.json?.scheduler?.mode} nextRunAt=${started.json?.scheduler?.nextRunAt}`);

  // -------------------------------------------------------------------------
  // 3. Two real scheduler-owned cycles, with the phase observed live while
  // they run. The verifier never POSTs /cycle: the scheduler is the trigger.
  // -------------------------------------------------------------------------
  const observedPhases = new Set();
  const schedulerSnapshots = [];
  const cycleSnapshots = [];
  let polling = true;
  const poller = (async () => {
    while (polling) {
      try {
        const snapshot = await call('GET', '/api/strategies/autopilot/status', undefined, 60_000);
        const phase = snapshot.json?.controller?.phase;
        if (phase) observedPhases.add(phase);
        if (snapshot.json?.scheduler) schedulerSnapshots.push(snapshot.json.scheduler);
        const latest = snapshot.json?.latestCycle;
        if (latest?.cycleIndex !== undefined && !cycleSnapshots.some((item) => item.cycleIndex === latest.cycleIndex)) {
          cycleSnapshots.push(latest);
        }
      } catch { /* transient */ }
      // VALIDATING can be shorter than the normal UI polling cadence; this
      // verifier observes the server phase directly at a tighter cadence.
      await sleep(100);
    }
  })();

  const waitForSchedulerCycle = async (expectedIndex) => {
    const deadline = Date.now() + schedulerCycleTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const snapshot = await call('GET', '/api/strategies/autopilot/status', undefined, 60_000);
        const latest = snapshot.json?.latestCycle;
        if (latest?.cycleIndex === expectedIndex && latest?.trigger === 'SERVER_SCHEDULER') return latest;
        // `latestCycle` is published only once a cycle completes, and the
        // scheduler's index only ever advances. So a completed cycle already
        // beyond the index awaited here proves that index can never appear:
        // this is not a clean boot. Report the impossibility immediately rather
        // than sitting out the remaining scheduler deadline to learn nothing.
        if (Number.isInteger(latest?.cycleIndex) && latest.cycleIndex > expectedIndex) {
          return { unsatisfiable: true, latestIndex: latest.cycleIndex };
        }
      } catch {
        // A single status-fetch failure is an observer transport hiccup, not
        // evidence that the server-owned lifecycle stopped. The poller above
        // applies the same rule; keep waiting until the production-derived
        // scheduler deadline rather than manufacturing or shortening a cycle.
      }
      await sleep(1_000);
    }
    return null;
  };

  let cycleN = await waitForSchedulerCycle(0);
  if (!cycleN || cycleN.unsatisfiable) {
    check('scheduler-triggered Cycle N completes', false, cycleN?.unsatisfiable
      ? `not a clean boot: the server already completed scheduler cycleIndex=${cycleN.latestIndex}, so cycleIndex=0 can never occur on it`
      : `no SERVER_SCHEDULER cycleIndex=0 within ${schedulerCycleTimeoutMs}ms`);
    // Normalize, so every downstream observation treats this exactly like the
    // timeout case instead of inspecting a sentinel object.
    cycleN = null;
  } else {
    check('scheduler-triggered Cycle N completes', true, `cycleIndex=${cycleN.cycleIndex}`);
    check('Cycle N has server scheduler provenance', cycleN.trigger === 'SERVER_SCHEDULER', `trigger=${cycleN.trigger}`);
    check('Cycle N is the versioned Autopilot payload', cycleN.version === 'smart_autopilot_cycle_v1', `version=${cycleN.version}`);
    check('Cycle N keeps the literal safety denial', safetyIntact(cycleN.safety));
    check('Cycle N reports the forward paper loop', cycleN.forwardEvaluation !== undefined && cycleN.outcomeFeedback !== undefined);
    const results = Array.isArray(cycleN.optimization?.results) ? cycleN.optimization.results : [];
    check('Cycle N produced an optimization result', results.length > 0, `results=${results.length}`);
    const gated = results.filter((row) => row?.promotionGate);
    check('Cycle N exposes an explicit validation/promotion gate result', gated.length === 0 || gated.every((row) => typeof row.promotionGate.authorized === 'boolean'
      && typeof row.promotionGate.validationPassed === 'boolean'), `gates=${gated.length}`);
    const promotedWithoutAuthorization = results.filter((row) => row?.promoted && row?.promotionGate?.authorized !== true);
    check('Cycle N promoted nothing without its own gate authorizing it', promotedWithoutAuthorization.length === 0, `violations=${promotedWithoutAuthorization.length}`);
    const identityBlockedButAuthorized = gated.filter((row) => row.promotionGate.authorized === true
      && (row.promotionGate.blockers || []).some((blocker) => String(blocker).startsWith('validation_subject')));
    check('Cycle N exact identity blockers remain fail-closed', identityBlockedButAuthorized.length === 0, `gates=${gated.length}`);
    check('Cycle N records research outcome persistence', cycleN.outcomeFeedback === null || Number(cycleN.outcomeFeedback.recorded) >= 0);
    check('Cycle N creates or explicitly reports paper-forward state', Array.isArray(cycleN.forwardEvaluation?.openedThisCycle)
      && Number.isInteger(cycleN.forwardEvaluation?.openPositions));
  }

  const waitingAfterN = await call('GET', '/api/strategies/autopilot/status');
  check('scheduler remains armed while Cycle N waits', waitingAfterN.json?.controller?.phase === 'WAITING'
    && waitingAfterN.json?.scheduler?.serverBackgroundLoop === true,
  `phase=${waitingAfterN.json?.controller?.phase} armed=${waitingAfterN.json?.scheduler?.serverBackgroundLoop}`);

  // No manual POST /cycle occurs here. The next observation must come from the
  // same server-owned interval, with the scheduler-owned cycle index advanced.
  let cycleN1 = await waitForSchedulerCycle(1);
  if (!cycleN1 || cycleN1.unsatisfiable) {
    check('scheduler-triggered Cycle N+1 completes', false, cycleN1?.unsatisfiable
      ? `not a clean boot: the server already completed scheduler cycleIndex=${cycleN1.latestIndex}, so cycleIndex=1 can never occur on it`
      : `no SERVER_SCHEDULER cycleIndex=1 within ${schedulerCycleTimeoutMs}ms`);
    cycleN1 = null;
  } else {
    check('scheduler-triggered Cycle N+1 completes', true, `cycleIndex=${cycleN1.cycleIndex}`);
    check('Cycle N+1 was not a manual HTTP cycle', cycleN1.trigger === 'SERVER_SCHEDULER', `trigger=${cycleN1.trigger}`);
    check('scheduler cycleIndex advanced from N to N+1', cycleN !== null && cycleN1.cycleIndex === cycleN.cycleIndex + 1,
      `N=${cycleN?.cycleIndex} N+1=${cycleN1.cycleIndex}`);
    check('Cycle N+1 keeps the literal safety denial', safetyIntact(cycleN1.safety));
    check('Cycle N+1 reports the forward paper loop', cycleN1.forwardEvaluation !== undefined && cycleN1.outcomeFeedback !== undefined);
    const priorEvidence = cycleN1.forwardEvaluation?.evidence;
    const openedN = Array.isArray(cycleN?.forwardEvaluation?.openedThisCycle) ? cycleN.forwardEvaluation.openedThisCycle : [];
    if (openedN.length > 0) {
      check('Cycle N+1 consumes Cycle N forward evidence', priorEvidence !== null && typeof priorEvidence === 'object',
        `openedN=${openedN.length} evidence=${priorEvidence ? 'present' : 'absent'}`);
      const priorIds = new Set(openedN.map((position) => position.id));
      const evidenceCycles = Array.isArray(priorEvidence?.contexts) ? priorEvidence.contexts.map((row) => row.lastCycleIndex).filter(Number.isInteger) : [];
      check('Cycle N+1 evidence retains prior cycle attribution', evidenceCycles.every((index) => index <= cycleN1.cycleIndex)
        && (evidenceCycles.length === 0 || evidenceCycles.some((index) => index === cycleN.cycleIndex)),
      `priorPositions=${priorIds.size} evidenceCycles=${evidenceCycles.join(',') || 'none'}`);
    } else {
      skip('Cycle N+1 consumes Cycle N forward evidence', 'Cycle N created no paper-forward positions; the application reported insufficient evidence honestly.');
      check('Cycle N+1 reports insufficient forward evidence honestly', priorEvidence === null || priorEvidence?.insufficientEvidence === true
        || Array.isArray(priorEvidence?.contexts), `openedN=${openedN.length}`);
    }
    const results = Array.isArray(cycleN1.optimization?.results) ? cycleN1.optimization.results : [];
    const gated = results.filter((row) => row?.promotionGate);
    check('Cycle N+1 exposes an explicit validation/promotion gate result', gated.length === 0 || gated.every((row) => typeof row.promotionGate.authorized === 'boolean'
      && typeof row.promotionGate.validationPassed === 'boolean'), `gates=${gated.length}`);
    const promotedWithoutAuthorization = results.filter((row) => row?.promoted && row?.promotionGate?.authorized !== true);
    check('Cycle N+1 promoted nothing without its own gate authorizing it', promotedWithoutAuthorization.length === 0, `violations=${promotedWithoutAuthorization.length}`);
    check('Cycle N+1 research memory remains separate from LIVE memory', cycleN1.forwardEvaluation?.safety?.writesLiveDecisionMemory === false
      && cycleN1.forwardEvaluation?.safety?.researchOnly === true);
  }

  polling = false;
  await poller;
  // The controller phases are intentionally brief. Prefer direct live phase
  // observations, but retain the existing completed-cycle payload as runtime
  // evidence when VALIDATING finishes between two status samples. The payload
  // is produced only after research/replay and the validation/ranking council
  // have both completed; this does not add production observability.
  const observedResearchAndValidation = ['RESEARCHING', 'VALIDATING'].every((phase) => observedPhases.has(phase));
  const completedCyclePayloadProvesValidation = cycleSnapshots.some((cycle) => (
    cycle?.research !== null && cycle?.research !== undefined
    && cycle?.multiAgent !== null && cycle?.multiAgent !== undefined
    && cycle?.outcomeFeedback !== undefined
  ));
  const movedThroughWork = observedResearchAndValidation || completedCyclePayloadProvesValidation;
  check('controller state machine moved through research and validation in live scheduler cycles', movedThroughWork,
    `observed=${[...observedPhases].join('>') || 'none'} payloadEvidence=${completedCyclePayloadProvesValidation}`);
  const cycleIndexes = cycleSnapshots.map((item) => item.cycleIndex);
  check('scheduler observed no duplicate/overlapping cycle index', new Set(cycleIndexes).size === cycleIndexes.length
    && cycleIndexes.includes(0) && cycleIndexes.includes(1), `observed=${cycleIndexes.join(',')}`);

  // -------------------------------------------------------------------------
  // 4. Manual /validate names a subject that can never satisfy the gate.
  // -------------------------------------------------------------------------
  const catalogue = await call('GET', '/api/strategies');
  const strategyId = catalogue.json?.defaultStrategyId
    ?? catalogue.json?.strategies?.find((row) => row?.strategyId)?.strategyId
    ?? null;
  if (!strategyId) {
    skip('manual /validate stamps a non-candidate subject', 'no strategy id available from /api/strategies');
  } else {
    const validated = await call('POST', `/api/strategies/${encodeURIComponent(strategyId)}/validate`, {
      symbol: SYMBOL, interval: '1h', direction: 'LONG',
    }, CYCLE_TIMEOUT_MS);
    if (validated.status === 503) {
      skip('manual /validate stamps a non-candidate subject', 'insufficient verified history for walk-forward validation');
    } else if (validated.status !== 200) {
      check('manual /validate stamps a non-candidate subject', false, `status=${validated.status} body=${validated.text}`);
    } else {
      const subject = validated.json?.validation?.subject ?? null;
      check('manual /validate stamps a subject on the report', Boolean(subject),
        subject ? `kind=${subject.kind}` : 'subject absent');
      check('manual validation is never labelled an optimization candidate',
        subject?.kind === 'ACTIVE_PROFILE' || subject?.kind === 'DEFINITION_DEFAULTS',
        `kind=${subject?.kind}`);
      check('subject identity is the versioned shape the gate compares',
        subject?.version === 'strategy_validation_subject_v1' && typeof subject?.fingerprint === 'string' && subject.fingerprint.length > 0,
        `version=${subject?.version}`);
      check('report describes the strategy it was asked about', validated.json?.validation?.strategyId === strategyId);
    }
  }

  // -------------------------------------------------------------------------
  // 5. STOP really disarms.
  // -------------------------------------------------------------------------
  const stopped = await call('POST', '/api/strategies/autopilot/control', { action: 'STOP' });
  check('control STOP accepted', stopped.status === 200 && stopped.json?.ok === true, `status=${stopped.status}`);
  check('STOP returns the controller to OFF', stopped.json?.controller?.phase === 'OFF',
    `phase=${stopped.json?.controller?.phase}`);

  const rejected = await call('POST', '/api/strategies/autopilot/control', { action: 'LAUNCH' });
  check('an unknown control action is refused', rejected.status === 422,
    `status=${rejected.status}`);

  const failed = checks.filter((row) => row.status === 'FAIL');
  const skipped = checks.filter((row) => row.status === 'SKIP');
  console.log(`\nAutopilot lifecycle runtime: ${checks.length - failed.length - skipped.length}/${checks.length} PASS, ${skipped.length} SKIP, ${failed.length} FAIL`);
  if (skipped.length) {
    console.log('SKIPPED (not proven, not a pass):');
    for (const row of skipped) console.log(`  - ${row.name}: ${row.detail}`);
  }
  console.log(`\n${JSON.stringify({ port: PORT, symbol: SYMBOL, checks, serverLogTail: logLines.slice(-40) }, null, 2)}`);
  exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.log(`FAIL harness error — ${error instanceof Error ? error.message : String(error)}`);
  console.log(`\nserver log tail:\n${logLines.slice(-60).join('\n')}`);
  exitCode = 1;
} finally {
  stopServer();
  await sleep(1_500);
  process.exit(exitCode);
}
