import test from 'node:test';
import assert from 'node:assert/strict';
import {courseKey, learnerRoute, moduleHref, normaliseLearningPaths, nextLearningModule} from '../src/components/hub/hubLearningModel.js';
import {hubActivityHandler, HUB_MODULE_CONTRACT_VERSION} from '../src/components/hub/hubModuleContract.js';

test('every active enrollment keeps its course, prerequisites and independent progress', () => {
  const input={enrolments:[{id:'enrolment-a',course:{id:'course-a'},modules:[{id:'a',status:'completed',activities:[{id:'one',status:'completed'}]},{id:'b',available:false,prerequisiteModuleIds:['a'],activities:[]}]},{id:'enrolment-b',course:{id:'course-b'},modules:[{id:'c',available:true,activities:[{id:'two'}]}]},{id:'withdrawn',status:'withdrawn',modules:[{id:'hidden'}]}]};
  const original=structuredClone(input);const paths=normaliseLearningPaths(input);
  assert.equal(paths.length,2);assert.deepEqual(input,original);
  assert.equal(paths[0].progress.percentage,100);assert.equal(paths[1].progress.percentage,0);
  assert.equal(paths[0].modules[1].locked,true);assert.equal(paths[0].modules[1].prerequisites[0].completed,true);
  assert.equal(nextLearningModule(paths).module.id,'c');assert.equal(courseKey(paths[1]),'course-b');
});
test('module links round-trip exact IDs and malformed/foreign routes do not fall through to learning',()=>{
  const path={course:{id:'course / ?'}};const module={id:'module #%'};
  assert.deepEqual(learnerRoute(moduleHref(path,module)),{kind:'module',course:'course / ?',module:'module #%'});
  assert.equal(learnerRoute('#/courses/%zz/modules/x').kind,'missing');
  assert.equal(learnerRoute('#/unknown').kind,'missing');assert.equal(learnerRoute('#hub-learning').kind,'learn');
  assert.deepEqual(learnerRoute('#/catalog?q=saldo&course=second&state=locked'),{kind:'catalog',query:'saldo',course:'second',state:'locked'});
});
test('empty or withdrawn training never invents a next module',()=>{
  assert.deepEqual(normaliseLearningPaths({enrolments:[]}),[]);
  assert.equal(nextLearningModule(normaliseLearningPaths({enrolments:[{status:'withdrawn',modules:[{id:'a'}]}]})),null);
});
test('built-in activity contract dispatches one handler and fails closed for unknown definitions',()=>{
  assert.equal(HUB_MODULE_CONTRACT_VERSION,1);
  assert.equal(hubActivityHandler({type:'article'}),'article');
  assert.equal(hubActivityHandler({type:'focused_practice',content:{surface:'balance'}}),'balance');
  assert.equal(hubActivityHandler({type:'article',content:{executionKind:'official_evaluation'}}),'official');
  assert.equal(hubActivityHandler({type:'focused_practice',content:{executionKind:'account_creation'}}),'account');
  for(const content of [{executionKind:'future_execution'},{executionKind:'constructor'},{surface:'future_surface'}])assert.equal(hubActivityHandler({type:'focused_practice',content}),'unsupported');
  assert.equal(hubActivityHandler({type:'quick_simulation'}),'unsupported');
  assert.equal(hubActivityHandler({type:'quick_simulation',content:{policyStatus:'required'}}),'policyBlocked');
});
