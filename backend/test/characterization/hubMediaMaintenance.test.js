import test from 'node:test';
import assert from 'node:assert/strict';
import {startHubMediaMaintenance} from '../../src/hub/hubMediaMaintenance.js';

function clock(){const queue=[];return {queue,setTimeout(callback,delay){const handle={callback,delay,unref(){}};queue.push(handle);return handle;},clearTimeout(handle){const index=queue.indexOf(handle);if(index>=0)queue.splice(index,1);}};}

test('maintenance backs off failed batches, drains a bounded backlog, then leaves idle database alone for a day',async()=>{
  const timers=clock();const results=[{failed:1,claimed:1},{failed:0,claimed:100},{failed:0,claimed:0}];
  const worker=startHubMediaMaintenance({timers,cleanup:{async run(options){assert.deepEqual(options,{apply:true,limit:100});return results.shift();}}});
  assert.equal(timers.queue[0].delay,60000);
  await timers.queue.shift().callback();assert.equal(timers.queue[0].delay,300000);
  await timers.queue.shift().callback();assert.equal(timers.queue[0].delay,300000);
  await timers.queue.shift().callback();assert.equal(timers.queue[0].delay,86400000);
  worker.stop();assert.equal(timers.queue.length,0);
});

test('stopping during Storage work prevents a later maintenance run',async()=>{
  const timers=clock();let release;let runs=0;
  const worker=startHubMediaMaintenance({timers,cleanup:{run(){runs++;return new Promise(resolve=>{release=resolve;});}}});
  const active=timers.queue.shift().callback();assert.equal(runs,1);assert.equal(timers.queue.length,0);
  worker.stop();release({failed:0,claimed:0});await active;assert.equal(timers.queue.length,0);
});
