import assert from 'node:assert/strict';
import test from 'node:test';
import {localCapacityClientCount,settleCapacityClients} from './integration/localCapacityOptions.mjs';

test('local capacity defaults to ten and supports explicit larger bounded workloads',()=>{
  assert.equal(localCapacityClientCount({}),10);
  for(const count of [1,20,50,100])assert.equal(localCapacityClientCount({TREZ_LOCAL_CAPACITY_CLIENTS:String(count)}),count);
});
test('invalid local capacity is rejected before fixture creation',()=>{
  for(const value of ['',0,-1,101,'1.5','1e2',' 20','ten'])assert.throws(()=>localCapacityClientCount({TREZ_LOCAL_CAPACITY_CLIENTS:value}),/integer from 1 to 100/);
});
test('capacity failure drains outstanding clients before cleanup can start',async()=>{
  let release;let drained=false;let finished=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const running=settleCapacityClients([()=>{throw new Error('fixture failure');},async()=>{await gate;drained=true;}],'workload failed');
  const checked=assert.rejects(running,error=>{finished=true;assert.equal(drained,true);assert.equal(error.errors.length,1);return true;});
  await Promise.resolve();await Promise.resolve();assert.equal(finished,false);release();await checked;
});
test('capacity results preserve client order despite differing completion order',async()=>{
  assert.deepEqual(await settleCapacityClients([async()=>{await Promise.resolve();return 1;},()=>2],'failed'),[1,2]);
});
