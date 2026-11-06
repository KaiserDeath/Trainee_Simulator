import test from 'node:test';import assert from 'node:assert/strict';
import {instructionTexts,scopedContentText,questionStemText,questionChoiceText} from '../src/i18n/hubContent.js';
import {translateHub,hubMessage,hubText} from '../src/i18n/hubLocale.js';
test('instruction text extraction excludes identifiers, media and operational configuration',()=>{
 const values=instructionTexts({title:'Lesson',instruction:{paragraphs:['Read this'],items:[{id:'private-id',label:'Check this'}],mediaAssetIds:['asset-id'],surface:'balance',executionKind:'native'}});
 assert.deepEqual(values,['Lesson','Read this','Check this']);
});
test('scoped instruction text overrides only content and preserves source placeholders and prototype-like keys',()=>{
 const map=JSON.parse('{"Continue":"Texto de la lección","__proto__":"Texto seguro","Keep {0}":"Conserve {0}"}');
 assert.equal(scopedContentText('es','Continue',map),'Texto de la lección');assert.equal(scopedContentText('en','Continue',map),'Continue');
 assert.equal(scopedContentText('es','constructor',map),'constructor');assert.equal(scopedContentText('es','__proto__',map),'Texto seguro');assert.equal(scopedContentText('es','Keep {0}',map),'Conserve {0}');
});
test('question and choice translations remain distinct even when canonical wording is identical',()=>{
 const question={question:'Continue',choices:[{id:'choice',label:'Continue'}],displayTranslation:{es:{question:'Pregunta en español',choices:{choice:'Continuar'}}}};
 assert.equal(questionStemText('es',question,value=>value),'Pregunta en español');assert.equal(questionChoiceText('es',question,question.choices[0],value=>value),'Continuar');
 assert.equal(questionStemText('en',question,value=>value),'Continue');assert.equal(questionChoiceText('es',question,{id:'constructor',label:'Unknown'},value=>value),'Unknown');
});
test('saved-progress notices retain their pinned content translation while locale changes',()=>{
 const message=hubMessage('{0} progress was saved.',[hubText('New lesson',{'New lesson':'Lección nueva'})]);
 assert.equal(translateHub('en',message),'New lesson progress was saved.');assert.equal(translateHub('es',message),'Se guardó el progreso de Lección nueva.');
});
