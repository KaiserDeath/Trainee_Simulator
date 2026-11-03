import {randomUUID} from 'node:crypto';
export function startSimulationWorker({client,gameMaster,pollMs=1000,autoStart=true,onError=()=>console.error('Durable simulation worker failed; the job will be retried.')}={}){
  const workerId=randomUUID();let busy=false;let stopped=false;let nextAssessmentSweep=0;
  async function rpc(name,args={}){const result=await client.rpc(name,args);if(result.error)throw new Error(`Worker persistence failed: ${name}`);return result.data;}
  async function tick(){
    if(busy||stopped)return;busy=true;
    let job;let heartbeat;
    try{
      if(Date.now()>=nextAssessmentSweep){
        await rpc('hub_expire_scored_evaluation_attempts');
        nextAssessmentSweep=Date.now()+15000;
      }
      const jobs=await rpc('hub_claim_simulation_job');job=jobs?.[0];if(!job)return;
      heartbeat=setInterval(()=>{void rpc('hub_renew_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token}).catch(onError);},5000);heartbeat.unref();
      if(new Date(job.deadline).getTime()>Date.now())await gameMaster.generateOperations(job.session_id,{jobId:job.id,leaseToken:job.lease_token,deliveryId:`${job.id}:${job.sequence_number}`,workerId});
      await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:true});
    }catch(error){
      onError(error);
      if(job)await rpc('hub_finish_simulation_job',{p_job_id:job.id,p_lease_token:job.lease_token,p_success:false}).catch(onError);
    }finally{if(heartbeat)clearInterval(heartbeat);busy=false;}
  }
  const timer=autoStart?setInterval(()=>void tick(),pollMs):null;if(autoStart)void tick();
  return {workerId,tick,stop(){stopped=true;clearInterval(timer);}};
}
