import { readFileSync } from 'node:fs';
import {
  computeCscvPbo,
  fingerprintSelectionHypothesis,
  selectDeterministicBlockLength,
  statisticalValidationPolicyFingerprint,
  validateReturnEvidence,
} from '../../src/services/statisticalValidation.ts';

const failures=[];
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures.push(name)};
const throws=(fn,needle)=>{try{fn();return false}catch(error){return String(error?.message||error).includes(needle)}};

const returns=Array.from({length:100},(_,i)=>0.12+Math.sin(i/8)*0.05);
const a=validateReturnEvidence(returns,{selectionHypothesisFingerprints:['h:a','h:a','h:b'],bootstrapSamples:500,seed:123});
const b=validateReturnEvidence(returns,{selectionHypothesisFingerprints:['h:b','h:a'],bootstrapSamples:500,seed:123});
check('multiplicity counts distinct selection hypotheses',a.triedVariants===2&&a.selectionHypothesisFingerprints.join(',')==='h:a,h:b');
check('bootstrap is deterministic for the same series/policy/seed',JSON.stringify(a)===JSON.stringify(b));
check('block length is data-driven and versioned',a.blockLengthMethod==='acf_decay_block_length_v1'&&a.blockLength===selectDeterministicBlockLength(returns));
check('new and legacy sqrt(N) confidence intervals are both reported',a.legacySqrtBlockLength===10&&a.legacySqrtLowerConfidenceBoundPct!==null&&a.lowerConfidenceBoundPct!==null);
check('positive-mean probability and DSR diagnostics are explicit',a.probabilityPositiveMean!==null&&a.deflatedSharpeRatioProbability!==null);

const basePolicy={familyWiseAlpha:.05,minimumRawSample:30,minimumEffectiveSample:20,bootstrapSamples:500,blockLengthMethod:'acf_decay_block_length_v1',multiplicityMethod:'DISTINCT_SELECTION_HYPOTHESES'};
check('validation-policy fingerprint changes when a governed threshold changes',statisticalValidationPolicyFingerprint(basePolicy)!==statisticalValidationPolicyFingerprint({...basePolicy,familyWiseAlpha:.10}));

const fps=['a','b','c','d'].map(id=>fingerprintSelectionHypothesis({id}));
const insufficient=computeCscvPbo({source:'DEVELOPMENT_SELECTION_MATRIX',candidateFingerprints:fps.slice(0,3),partitionLabels:['p1','p2','p3','p4'],matrix:[[1,2,3,4],[2,3,4,5],[3,4,5,6]]});
check('insufficient CSCV structure returns INSUFFICIENT_STRUCTURE and no number',insufficient.state==='INSUFFICIENT_STRUCTURE'&&insufficient.pbo===null);
const pbo=computeCscvPbo({source:'DEVELOPMENT_SELECTION_MATRIX',candidateFingerprints:fps,partitionLabels:['p1','p2','p3','p4'],matrix:[[1,1,1,1],[2,2,-2,-2],[0,0,0,0],[-1,-1,-1,-1]]});
check('CSCV/PBO runs on a complete development selection matrix',pbo.state==='OK'&&pbo.combinationsEvaluated===6&&Number.isFinite(pbo.pbo));
check('PBO API rejects non-development source labels',throws(()=>computeCscvPbo({source:'FINAL_HOLDOUT',candidateFingerprints:fps,partitionLabels:['p1','p2','p3','p4'],matrix:[[1,1,1,1],[2,2,2,2],[3,3,3,3],[4,4,4,4]]}),'pbo_requires_development_selection_matrix'));

const optimizer=readFileSync('src/services/strategyOptimization.ts','utf8');
const validation=readFileSync('src/services/strategyValidation.ts','utf8');
const routes=readFileSync('src/services/apexNextMarketRoutes.ts','utf8');
check('optimizer computes PBO on development and never opens final sealed holdout',optimizer.includes('const developmentPbo = computeCscvPbo')&&!optimizer.includes('authorizeFinalHoldoutAccess({')&&optimizer.includes("finalHoldoutStatus: 'SEALED_NOT_OPENED_DURING_OPTIMIZATION'"));
check('optimizer reports distinct hypothesis count separately from evaluator calls',optimizer.includes('triedCandidates: selectionHypothesisFingerprints.length')&&optimizer.includes('completedEvaluations'));
check('validation multiplicity no longer counts windows or neighbor diagnostics',!validation.includes('inputs.neighborRuns.length + inputs.windows.length')&&validation.includes('selectionHypothesisFingerprints'));
check('automatic and manual candidate validation receive optimizer hypothesis ledger',routes.split('selectionHypothesisFingerprints: report.selectionHypothesisFingerprints').length-1>=2);
check('optimizer council can only approve progression to final validation',routes.includes('council.approvedForFinalValidation')&&!routes.includes('council.approvedForPromotion'));
check('candidate validation-policy fingerprint binds statistical methodology version',optimizer.includes('statisticalValidationPolicyVersion: STATISTICAL_VALIDATION_POLICY_VERSION')&&routes.includes('statisticalValidationPolicyVersion: STATISTICAL_VALIDATION_POLICY_VERSION'));

if(failures.length){console.error(`CP07 statistical-integrity acceptance: FAIL (${failures.length})`);process.exit(1)}
console.log('CP07 statistical-integrity acceptance: PASS');
