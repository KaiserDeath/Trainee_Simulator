import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('../config/hub-release-acceptance.json',import.meta.url),'utf8'));
assert.equal(config.version,1);
assert.deepEqual(config.requiredLocales,['en','es']);
const pending=[];
for(const [key,assignment] of Object.entries(config.responsibilities)){
  const position=config.positions[assignment.position];assert.ok(position,`Unknown position for ${key}`);
  assert.ok(typeof position.label==='string'&&position.label.trim());
  assert.ok(['TRAINER','ADMIN','RRHH'].includes(position.requiredHubRole));
  if(!assignment.assignedUsername)pending.push(`${key}: assign an actual ${position.label} username`);
}
assert.ok(config.audiences.includes('newLearners')&&config.audiences.includes('existingEmployees'));
assert.ok(config.rollout.totalLearnerLimit===null||(Number.isInteger(config.rollout.totalLearnerLimit)&&config.rollout.totalLearnerLimit>=1));
assert.ok(Number.isInteger(config.pilot.maximumLearners)&&config.pilot.maximumLearners>=1);
assert.ok(Number.isInteger(config.pilot.maximumConcurrentLearners)&&config.pilot.maximumConcurrentLearners>=1&&config.pilot.maximumConcurrentLearners<=config.pilot.maximumLearners);
assert.ok(Number.isInteger(config.rollout.initialConcurrentLearnerTarget)&&config.rollout.initialConcurrentLearnerTarget>=1);
if(config.pilot.maximumConcurrentLearners>config.rollout.initialConcurrentLearnerTarget&&!config.pilot.capacityEvidence)pending.push('pilot: verify larger hosted concurrent capacity before expanding simultaneous use; local stress results do not certify hosting');
assert.ok(Array.isArray(config.pilot.learnerUsernames));
assert.equal(new Set(config.pilot.learnerUsernames).size,config.pilot.learnerUsernames.length,'Duplicate pilot learner');
assert.ok(config.pilot.learnerUsernames.length<=config.pilot.maximumLearners);
if(!config.pilot.cohortId&&!config.pilot.learnerUsernames.length)pending.push('pilot: select an actual cohort or learner roster');
for(const [gate,record] of Object.entries(config.acceptance)){
  const actor=record.approvedBy||record.verifiedBy||record.completedBy;
  const when=record.approvedAt||record.verifiedAt||record.completedAt;
  if(!actor||!when)pending.push(`${gate}: actual person and dated evidence required`);
  else assert.ok(Number.isFinite(Date.parse(when)),`Invalid date for ${gate}`);
  if(gate==='curriculum'){
    if(record.reviewedPolicyDigests.length!==4)pending.push('curriculum: all four reviewed policy digests required');
    if(record.reviewedTranslationRevision!==config.translationRevision)pending.push('curriculum: review English and Spanish display pack '+config.translationRevision);
  }else if(!record.evidence)pending.push(`${gate}: evidence reference required`);
}
console.log(JSON.stringify({status:pending.length?'pending':'recorded; verify authenticated evidence before release',pending},null,2));
if(pending.length&&!process.argv.includes('--allow-pending'))process.exitCode=1;
