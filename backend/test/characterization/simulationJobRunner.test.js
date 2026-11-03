import test from 'node:test';
import assert from 'node:assert/strict';
import {startSimulationWorker} from '../../src/engine/simulationJobRunner.js';

const assigned={id:'job-1',session_id:'session-1',lease_token:'lease-1',sequence_number:7,deadline:'2099-01-01T00:00:00Z'};
test('replacement worker retains delivery identity after a failed generation',async()=>{
  const calls=[];const deliveries=[];let failures=1;
  const client={async rpc(name,args){calls.push([name,args]);return {data:name==='hub_claim_simulation_job'?[assigned]:true};}};
  const gameMaster={async generateOperations(_session,delivery){deliveries.push(delivery);if(failures-- >0)throw new Error('Injected interruption');}};
  const errors=[];
  const first=startSimulationWorker({client,gameMaster,autoStart:false,onError:error=>errors.push(error)});
  await first.tick();first.stop();
  const second=startSimulationWorker({client,gameMaster,autoStart:false,onError:error=>errors.push(error)});
  await second.tick();second.stop();
  assert.equal(errors.length,1);assert.equal(deliveries.length,2);
  assert.equal(deliveries[0].deliveryId,deliveries[1].deliveryId);
  assert.notEqual(deliveries[0].workerId,deliveries[1].workerId);
  assert.deepEqual(calls.filter(([name])=>name==='hub_finish_simulation_job').map(([,args])=>args.p_success),[false,true]);
});
test('expired assignment closes without generating another operation',async()=>{
  const calls=[];
  const worker=startSimulationWorker({autoStart:false,client:{async rpc(name,args){calls.push([name,args]);return {data:name==='hub_claim_simulation_job'?[{...assigned,deadline:'2000-01-01T00:00:00Z'}]:true};}},gameMaster:{generateOperations(){assert.fail('Expired assignment generated work');}}});
  await worker.tick();worker.stop();assert.equal(calls.at(-1)[1].p_success,true);
  assert.ok(calls.some(([name])=>name==='hub_process_worker_deadlines'));
});

test('idle worker waits for its recovery interval and a local work signal wakes it immediately',async()=>{
  const scheduled=[];let pendingJob=false;let claims=0;let deliveries=0;
  const worker=startSimulationWorker({client:{async rpc(name){if(name==='hub_claim_simulation_job'){claims++;return {data:pendingJob?[assigned]:[]};}if(name==='hub_next_worker_event')return {data:null};return {data:true};}},gameMaster:{async generateOperations(){deliveries++;pendingJob=false;}},scheduleTimer:(callback,delay)=>{scheduled.push({callback,delay});return scheduled.length;},cancelTimer(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(claims,1);assert.equal(scheduled.at(-1).delay,60000);
  pendingJob=true;worker.wake();assert.equal(scheduled.at(-1).delay,0);scheduled.at(-1).callback();
  await new Promise(resolve=>setImmediate(resolve));worker.stop();assert.equal(deliveries,1);assert.equal(claims,2);
});

test('an earlier persisted deadline determines the next wake time',async()=>{
  const scheduled=[];const deadline=Date.now()+2000;
  const worker=startSimulationWorker({client:{async rpc(name){return {data:name==='hub_claim_simulation_job'?[]:name==='hub_next_worker_event'?new Date(deadline).toISOString():true};}},gameMaster:{generateOperations(){assert.fail('No generation was assigned');}},scheduleTimer:(_callback,delay)=>{scheduled.push(delay);return scheduled.length;},cancelTimer(){}});
  await new Promise(resolve=>setImmediate(resolve));worker.stop();assert.ok(scheduled[0]>1000&&scheduled[0]<=2000);
});
test('overlapping ticks in one worker cannot claim two concurrent leases',async()=>{
  let release;let claims=0;
  const worker=startSimulationWorker({autoStart:false,client:{async rpc(name){if(name==='hub_claim_simulation_job'){claims++;return {data:[assigned]};}return {data:true};}},gameMaster:{async generateOperations(){await new Promise(resolve=>{release=resolve;});}}});
  const pending=worker.tick();while(!release)await new Promise(resolve=>setImmediate(resolve));
  await worker.tick();assert.equal(claims,1);release();await pending;worker.stop();
});
