import assert from 'node:assert/strict';
import test from 'node:test';
import {hubDisplayTranslations,hubDisplayTranslationMiddleware} from '../src/hub/hubDisplayTranslations.js';

test('display translation companions contain only text already authorized in the payload',()=>{
  const payload={title:'Account Creation',questions:[{code:'verification-first',question:'What must be verified before changing customer credits?',choices:[{id:'opaque-id',label:'Only the displayed customer name'}]}]};
  const before=JSON.stringify(payload);const translations=hubDisplayTranslations(payload,{includeQuestions:true});
  assert.equal(translations['Account Creation'],'Creación de cuentas');
  assert.equal(translations['Only the displayed customer name'],'Solo el nombre del cliente que se muestra');
  assert.equal(Object.keys(translations).length,3);assert.equal(JSON.stringify(payload),before);
  assert.ok(!JSON.stringify(translations).includes('correct_option'));
  assert.ok(!Object.hasOwn(translations,'What password evidence may be retained in ordinary training reports?'));
});
test('identifiers, passwords and arbitrary user fields do not request translations',()=>{
  assert.deepEqual(Object.keys(hubDisplayTranslations({id:'Account Creation',password:'Only the displayed customer name',username:'Account Creation',body:'Custom unknown note'})),[]);
});
test('denied responses and array response shapes stay unchanged',()=>{
  for(const payload of [{question:'What must be verified before changing customer credits?'},['Account Creation']]){
    let result;const res={statusCode:403,json:value=>{result=value;return res;}};hubDisplayTranslationMiddleware({},res,()=>{});res.json(payload);assert.equal(result,payload);
  }
});
test('successful companions preserve the canonical question and answer IDs',()=>{
  let result;const payload=Object.freeze({questions:[Object.freeze({code:'exact-player',question:'Which player should receive the assigned account operation?',choices:[{id:'exact',label:'The exact verified player in the correct assigned game context'}]})]});
  const res={statusCode:200,json:value=>{result=value;return res;}};hubDisplayTranslationMiddleware({path:'/scored-evaluations/attempts/fixture/runtime/start'},res,()=>{});res.json(payload);
  assert.equal(result.questions,payload.questions);assert.ok(result.displayTranslations.es[payload.questions[0].question]);assert.equal(result.questions[0].choices[0].id,'exact');
});
test('unrelated routes cannot use echoed text to obtain private question translations',()=>{
  let result;const payload={question:'Which player should receive the assigned account operation?'};
  const res={statusCode:200,json:value=>{result=value;return res;}};hubDisplayTranslationMiddleware({path:'/workspace/catalog'},res,()=>{});res.json(payload);assert.equal(result,payload);
});
test('runtime labels outside assigned question nodes do not receive private bank companions',()=>{
  const translations=hubDisplayTranslations({task:{label:'Which player should receive the assigned account operation?'},title:'Only the displayed customer name'},{includeQuestions:true});
  assert.deepEqual(Object.keys(translations),[]);
});
