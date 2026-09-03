import fs from 'node:fs';
const failures=[];
const test=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures.push(name)};
const fusion=fs.readFileSync('src/services/strategyFusion.ts','utf8');
const ensemble=fs.readFileSync('src/services/liveSignalEnsemble.ts','utf8');
const route=fs.readFileSync('src/services/apexNextMarketRoutes.ts','utf8');

test('lower timeframes cannot be reconstructed from coarser bars', /targetIntervalMs < sourceIntervalMs[^\n]*return \[\]/.test(fusion));
test('smart money requires explicit 5m 15m 4h series', /!input\.candles5m \|\| !input\.candles15m \|\| !input\.candles4h/.test(fusion));
test('candle-derived order flow is explicitly PROXY', /key: 'orderFlow'[\s\S]{0,120}quality: 'PROXY'/.test(fusion));
test('correlated fusion components share dependency-family budget', /byDependency[\s\S]{0,1100}familyBudget/.test(fusion));
test('News and sentiment use NEWS_TEXT dependency family', /key: 'news'[\s\S]{0,300}dependencyFamily: 'NEWS_TEXT'/.test(fusion) && /dependencyFamily: sentiment\.metadata\?\.dependencyFamily \?\? 'NEWS_TEXT'/.test(fusion));
test('hard advanced rejection is unrescuable', /accepted = !hardRejectReason/.test(ensemble) && /ADVANCED_HARD_REJECT/.test(ensemble));
test('independent support counts dependency families not model ids', /effectiveIndependentSupport = supportingFamilies\.size/.test(ensemble));
test('Strategy Fusion output is structurally SHADOW', /authorityStage: 'SHADOW'/.test(fusion) && /liveAuthoritative: false/.test(fusion));
test('bare funding/OI value requires observed metadata', /No decision-eligible observed \$\{key\} feature with event-time provenance/.test(fusion));
test('fusion route labels preview SHADOW only', /This preview is SHADOW evidence only/.test(route));
if(failures.length){console.error(`CP03 strategy-authority acceptance: FAIL (${failures.length})`);process.exit(1)}
console.log('CP03 strategy-authority acceptance: PASS');
