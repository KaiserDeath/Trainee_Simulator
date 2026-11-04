import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {hubMessage,hubServerMessage,translateHub} from '../src/i18n/hubLocale.js';
const require=createRequire(import.meta.url);const {parse}=require('@babel/parser');const traverse=require('@babel/traverse').default;
const spanish=JSON.parse(fs.readFileSync(new URL('../src/i18n/hub-es.json',import.meta.url),'utf8'));
test('interface keys have Spanish copy and preserve interpolated arguments',()=>{
  const root=new URL('../src/',import.meta.url);const files=[...fs.readdirSync(new URL('components/hub/',root)).filter(name=>name.endsWith('.jsx')).map(name=>`components/hub/${name}`),'pages/HubPage.jsx'];
  const missing=[];
  for(const file of files){const ast=parse(fs.readFileSync(new URL(file,root),'utf8'),{sourceType:'module',plugins:['jsx']});traverse(ast,{CallExpression(path){const first=path.node.arguments[0];if(['t','hubMessage'].includes(path.node.callee.name)&&first?.type==='StringLiteral'&&first.value.trim()&&!Object.hasOwn(spanish,first.value.trim())&&!Object.hasOwn(spanish,translateHub('en',first.value.trim())))missing.push(`${file}: ${first.value}`);}});}
  assert.deepEqual(missing,[]);
  for(const [en,es] of Object.entries(spanish))assert.deepEqual(en.match(/\{\d+\}/g)?.sort()||[],es.match(/\{\d+\}/g)?.sort()||[],en);
});
test('structured notices switch language without losing parameters or changing identity text',()=>{
  const message=hubMessage('Course assigned to {0}.',['Participant <OS_123>']);
  assert.equal(translateHub('es',message),'Curso asignado a Participant <OS_123>.');
  assert.equal(translateHub('en',message),'Course assigned to Participant <OS_123>.');
  assert.equal(translateHub('es',hubServerMessage('Uncatalogued server response')),'No se pudo registrar la acción. Reinténtela.');
  for(const text of ['constructor','toString','__proto__'])assert.equal(translateHub('es',text),text);
});
test('private question text is absent from the public UI catalog and production bundle',()=>{
  const privateCopy=JSON.parse(fs.readFileSync(new URL('../../backend/src/hub/hubQuestionDisplaySpanish.json',import.meta.url),'utf8'));
  const questions=Object.keys(privateCopy).filter(key=>key.endsWith('?'));
  const assets=new URL('../dist/assets/',import.meta.url);const bundle=fs.readdirSync(assets).filter(name=>name.endsWith('.js')).map(name=>fs.readFileSync(new URL(name,assets),'utf8')).join('\n');
  for(const question of questions){assert.equal(Object.hasOwn(spanish,question),false);assert.equal(bundle.includes(question),false);}
});
