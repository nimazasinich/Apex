import fs from 'node:fs';
const failures=[]; const t=(n,o)=>{console.log(`${o?'PASS':'FAIL'} ${n}`);if(!o)failures.push(n)};
const gate=fs.readFileSync('src/services/strategyPromotionGate.ts','utf8');
const registry=fs.readFileSync('src/services/strategyRegistry.ts','utf8');
const route=fs.readFileSync('src/services/apexNextMarketRoutes.ts','utf8');
const validation=fs.readFileSync('src/services/strategyValidation.ts','utf8');
t('registry distinguishes BASE_REPLAY from FULL_STRATEGY', /scope: 'BASE_REPLAY' \| 'FULL_STRATEGY'/.test(registry));
t('LIVE_ONLY inputs force BASE_REPLAY limitation', /dataMode === 'LIVE_ONLY'/.test(registry) && /scope: limitations\.length \? 'BASE_REPLAY' : 'FULL_STRATEGY'/.test(registry));
t('validation report carries scope', /validationScope/.test(validation) && /fullStrategyValidated: passedAllGates && validationScope === 'FULL_STRATEGY'/.test(validation));
t('automatic promotion blocks non-full scope', /validation_scope_not_full_strategy/.test(gate) && /full_strategy_validation_required/.test(gate));
t('automatic promotion success requires fullStrategyValidated', /validation\.fullStrategyValidated === true/.test(gate));
t('manual promotion blocks BASE_REPLAY', /BASE_REPLAY evidence cannot authorize a production-affecting optimization profile/.test(route));
t('manual promotion validates exact optimizer candidate', /candidateFingerprint = fingerprintStrategyValidationSubject\(candidateSubject\)/.test(route) && /subject: candidateSubject/.test(route));
t('manual promotion requires candidate-matched FULL_STRATEGY report', /validation\.validationScope !== 'FULL_STRATEGY'[\s\S]{0,120}validation\.fullStrategyValidated !== true/.test(route));
if(failures.length){console.error(`CP04 promotion-safety acceptance: FAIL (${failures.length})`);process.exit(1)}
console.log('CP04 promotion-safety acceptance: PASS');
