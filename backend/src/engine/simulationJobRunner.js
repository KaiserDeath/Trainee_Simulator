import {randomUUID} from 'node:crypto';
export function startSimulationWorker({client,gameMaster,pollMs=1000,idlePollMs=60000,autoStart=true,scheduleTimer=setTimeout,cancelTimer=clearTimeout,onError=()=>console.error('Durable simulation worker failed; the job will be retried.')}={}){
  const workerId=randomUUID();let busy=false;let stopped=false;let timer;let wakePending=false;
  function schedule(delay){if(!autoStart||stopped)return;if(timer!==undefined)cancelTimer(timer);timer=scheduleTimer(()=>{timer=undefined;void tick();},delay);}
  async function rpc(name,args={}){const result=await client.rpc(name,args);if(result.error)throw new Error(`Worker persistence failed: ${name}`);return result.data;}
  async function tick(){
    if(busy||stopped)return;busy=true;
    let job;let heartbeat;let failed=false;
    try{
      await rpc('hub_process_worker_deadlines');
      const jobs=await rpc('hub_claim_simulation_job');job=jobs?.[0];if(!job)return;
      heartbeat=setInterval(()=>{void rpc('hub_renew_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token}).catch(onError);},5000);heartbeat.unref();
      if(new Date(job.deadline).getTime()>Date.now())await gameMaster.generateOperations(job.session_id,{jobId:job.id,leaseToken:job.lease_token,deliveryId:`${job.id}:${job.sequence_number}`,workerId});
      await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:true});
    }catch(error){
      failed=true;
      onError(error);
      if(job)await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:false}).catch(onError);
    }finally{
      if(heartbeat)clearInterval(heartbeat);
      if(autoStart&&!stopped){
        let delay=job&&!failed?0:Math.max(pollMs,idlePollMs);
        if(!job||failed){
          try{const next=await rpc('hub_next_worker_event');const nextTime=next?new Date(next).getTime():NaN;if(Number.isFinite(nextTime))delay=Math.max(25,Math.min(idlePollMs,nextTime-Date.now()));}catch(error){onError(error);}
        }
        if(wakePending){wakePending=false;delay=0;}
        busy=false;schedule(delay);
      }else busy=false;
    }
  }
  if(autoStart)void tick();
  return {workerId,tick,wake(){if(stopped)return;if(busy)wakePending=true;else schedule(0);},stop(){stopped=true;if(timer!==undefined)cancelTimer(timer);}};
}
