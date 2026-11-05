import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const hubIntegrationCases=['hubWorkspace.sql','hubEvaluationRuntime.sql','hubBackendEvaluation.sql','hubCustomerEvaluation.sql','hubEvaluationPolicyVersions.sql','hubFinalEvaluation.sql','hubMixedPractice.sql','hubCohorts.sql','hubTrainingAssignments.sql','hubCoachingRetention.sql','hubFormalRetention.sql'];
const source=name=>readFileSync(new URL(`../backend/test/integration/${name}`,import.meta.url),'utf8');
export function readHubIntegrationCase(name){
  assert.ok(hubIntegrationCases.includes(name));
  if(name!=='hubFormalRetention.sql')return source(name);
  // Reuse real completed runtimes as a single rollback-only fixture; never
  // commit another suite or fabricate a passing score to test disposal.
  const setup=['hubFinalEvaluation.sql','hubEvaluationRuntime.sql'].map(file=>{
    const sql=source(file);assert.match(sql,/^BEGIN;/);assert.match(sql,/ROLLBACK;\s*$/);
    return sql.replace(/^BEGIN;/,'').replace(/ROLLBACK;\s*$/,'');
  }).join('\n');
  return `BEGIN;\n${setup}\n${source('formalRetentionAgeFixture.sql')}\n${source(name)}\nROLLBACK;`;
}
