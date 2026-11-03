import {randomUUID} from 'node:crypto';
import {onSimulationWork} from './simulationSignals.js';
import {pathToFileURL} from 'node:url';
import {supabase} from '../config/supabase.js';
import GameMaster from './GameMaster.js';

export function startSimulationWorker({client=supabase,gameMaster=GameMaster,pollMs=1000,idleMaxMs=30000,timers=globalThis,now=Date.now,onError=()=>console.error('Durable simulation worker failed; the job will be retried.')}={}){
  if(!Number.isFinite(pollMs)||pollMs<=0||!Number.isFinite(idleMaxMs)||idleMaxMs<pollMs)throw new Error('Worker poll and maximum idle intervals must be positive and ordered.');
  const workerId=randomUUID();let busy=false;let stopped=false;let timer;let wakePending=false;let idleDelay=pollMs;let retryDelay=pollMs;
  async function rpc(name,args={}){const result=await client.rpc(name,args);if(result.error)throw new Error(`Worker persistence failed: ${name}`);return result.data;}
  function schedule(delay){if(!stopped)timer=timers.setTimeout(()=>tick(),delay);}
  async function tick(){
    if(busy||stopped)return;timers.clearTimeout(timer);busy=true;
    let job;let heartbeat;let delay=pollMs;
    try{
      const nextAt=await rpc('hub_prepare_simulation_poll');
      const jobs=await rpc('hub_claim_simulation_job');job=jobs?.[0];
      if(!job){
        const nextTime=nextAt?new Date(nextAt).getTime():NaN;
        if(Number.isFinite(nextTime)){
          delay=Math.min(idleMaxMs,Math.max(pollMs,nextTime-now()));idleDelay=pollMs;
        }else{
          delay=idleDelay;idleDelay=Math.min(idleMaxMs,idleDelay*2);
        }
      }else{
        idleDelay=pollMs;
        heartbeat=timers.setInterval(()=>{void rpc('hub_renew_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token}).catch(onError);},5000);heartbeat.unref?.();
        if(new Date(job.deadline).getTime()>now())await gameMaster.generateOperations(job.session_id,{jobId:job.id,leaseToken:job.lease_token,deliveryId:`${job.id}:${job.sequence_number}`,workerId});
        await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:true});
      }
      retryDelay=pollMs;
    }catch(error){
      onError(error);
      if(job)await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:false}).catch(onError);
      delay=retryDelay;retryDelay=Math.min(idleMaxMs,retryDelay*2);
    }finally{
      if(heartbeat)timers.clearInterval(heartbeat);busy=false;
      if(wakePending){wakePending=false;idleDelay=pollMs;retryDelay=pollMs;delay=0;}
      schedule(delay);
    }
  }
  function wake(){
    if(stopped)return;idleDelay=pollMs;retryDelay=pollMs;
    if(busy)wakePending=true;else{timers.clearTimeout(timer);schedule(0);}
  }
  const unsubscribe=onSimulationWork(wake);
  void tick();
  return {workerId,tick,wake,stop(){unsubscribe();stopped=true;timers.clearTimeout(timer);}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const worker=startSimulationWorker();
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{worker.stop();process.exitCode=0;});
}
