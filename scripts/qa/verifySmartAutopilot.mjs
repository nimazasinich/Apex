import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, passed, detail = '') => checks.push({ name, passed: Boolean(passed), detail });

const app = read('src/App.tsx');
const page = read('src/pages/backtesting/BacktestingPage.tsx');
const optimizationHook = read('src/pages/backtesting/useBacktestingOptimization.ts');
const builder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const css = read('src/pages/backtesting/BacktestingPage.css');
const routes = read('src/services/apexNextMarketRoutes.ts');
const autopilot = read('src/services/smartAutopilot.ts');
const settings = read('src/pages/settings/SettingsPage.tsx');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');
const strategyRail = read('src/pages/strategies/StrategyEvidenceRail.tsx');
const miniToggle = read('src/components/SmartAutopilotMiniToggle.tsx');
const headerControl = read('src/components/workspace/AutopilotHeaderControl.tsx');
const workspaceShell = read('src/components/workspace/WorkspaceShell.tsx');
const controllerHook = read('src/lib/useAutopilotController.ts');
const packageJson = JSON.parse(read('package.json'));
const security = read('src/services/serverSecurity.ts');
const optimizationStore = read('src/services/strategyOptimizationStore.ts');
const openapi = read('openapi/apex-api.v1.yaml');
const compact = (value) => value.replace(/\s+/g, ' ');
const compactOpenapi = compact(openapi);

check('one-click persistent Smart Autopilot controls are wired globally and on both research pages', app.includes('setAutopilotEnabled') && app.includes('saveSettings(next)') && (app.match(/onAutopilotEnabledChange=\{setAutopilotEnabled\}/g) || []).length >= 3 && builder.includes('SmartAutopilotMiniToggle') && strategyRail.includes('SmartAutopilotMiniToggle') && miniToggle.includes('aria-pressed={isOn}') && workspaceShell.includes('AutopilotHeaderControl') && headerControl.includes('<strong>AUTOPILOT</strong>'));

check('global Autopilot control exposes authoritative server phase', headerControl.includes('data-autopilot-phase={phase}') && headerControl.includes('controller.phase') && headerControl.includes('controller.enabled') && headerControl.includes('controller.armedBy'));
check('browser boot preference never auto-stops an ENV/operator controller', controllerHook.includes('persisted operator') && controllerHook.includes("if (desiredEnabled && !snapshot.enabled) void send('START')") && !controllerHook.includes("send(desiredEnabled ? 'START' : 'STOP')"));
check('strong Autopilot lifecycle runtime is a required runtime verification gate', String(packageJson.scripts?.['test:runtime'] || '').includes('qa:autopilot-lifecycle-runtime'));
check('autopilot cycles every five minutes', optimizationHook.includes('window.setInterval(() => void runAutopilotOptimization(), 5 * 60_000)'));
check('autopilot uses bounded multi-market rotating contexts', optimizationHook.includes('maxContexts: 6') && optimizationHook.includes('symbols: marketOptions.slice(0, 4)') && autopilot.includes('startOffset = (cycleIndex * maxContexts) % all.length'));
check('strategy × market × timeframe × direction planner exists', autopilot.includes('buildSmartAutopilotPlan') && autopilot.includes("strategy.longShort === 'BOTH'") && autopilot.includes('preferredIntervalOrder'));
check('optimization promotion requires five-agent council', autopilot.includes("'EVIDENCE' | 'HOLDOUT' | 'COST_STRESS' | 'STABILITY' | 'OVERFIT_GUARD'") && routes.includes('runSmartAutopilotOptimizationCouncil(report)') && routes.includes('if (council.approvedForPromotion)'));
check('recurrent threshold deltas accumulate instead of resetting each cycle', optimizationStore.includes('previousDelta + incrementalDelta') && optimizationStore.includes('...(current?.scannerConfigDeltas || {})'));
check('recurrent learning starts from active promoted profile', routes.includes('const activeProfile = strategyOptimizationStore.getActive(context)') && routes.includes('...(activeProfile?.parameters || {})') && routes.includes('activeProfile?.scannerConfig'));
check('post-tuning verification uses existing multi-strategy research', routes.includes('runMultiStrategyResearch({') && routes.includes('applyActiveOptimization: true'));
check('post-tuning paper selection uses existing multi-agent council', routes.includes('runMultiAgentResearchCouncil(research') && routes.includes('multiAgentCouncilStore.put(multiAgent)'));
check('autopilot cycle is compute-rate-limited', security.includes("pathname === '/api/strategies/autopilot/cycle'"));
check('live exchange execution remains disabled', routes.includes('automaticOrderSubmission: false') && routes.includes('autonomousLiveExecutionEnabled: false') && routes.includes('riskGovernorBypassAllowed: false') && routes.includes('manualConfirmationRequired: true'));
check('Smart Autopilot UI is styled in Backtesting scope', css.includes('.apex-bt-smart-autopilot') && css.includes('.apex-bt-smart-autopilot.active'));
check('settings explain research/paper-only smart tuning', settings.includes('Smart Autopilot — rotate strategy/timeframe contexts every 5 minutes') && settings.includes('(research/paper only)'));
check('manual optimizer sends the backend contract field names', optimizationHook.includes('commissionPct, slippagePct, fundingPct, autoPromote: false') && !optimizationHook.includes('commissionPctPerSide: commissionPct'));
check('Smart Autopilot API is documented as research/paper-only', compactOpenapi.includes('/api/strategies/autopilot/cycle:') && compactOpenapi.includes('five-agent promotion council') && compactOpenapi.includes('No exchange order can be created or authorized'));
check('server status truthfully describes opt-in scheduling', routes.includes('scheduler: publicSchedulerState()') && routes.includes("mode: schedulerConfig.enabled ? 'SERVER_SCHEDULED' : 'CLIENT_OPT_IN'") && routes.includes('serverBackgroundLoop: schedulerTimer !== null') && routes.includes('APEX_AUTOPILOT_SCHEDULER'));
check('legacy direct optimizer auto-promotion is disabled', !routes.includes("if (value.autoPromote && report.promotion.eligible)") && routes.includes('legacy_auto_promote_ignored_use_smart_autopilot_cycle'));
check('Strategy Studio autopilot is routed through the five-agent Smart cycle', strategyPage.includes("apiMutate('/api/strategies/autopilot/cycle'") && strategyPage.includes('autoPromote: false') && !strategyPage.includes('autoPromote: auto && autopilotEnabled'));

for (const row of checks) console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
const failures = checks.filter((row) => !row.passed);
console.log(`\nSmart Autopilot source QA: ${checks.length - failures.length}/${checks.length} PASS`);
if (failures.length) process.exitCode = 1;
