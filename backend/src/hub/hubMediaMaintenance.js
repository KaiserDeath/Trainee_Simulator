// One bounded batch after startup, then daily when idle. Failed or full batches
// retry after five minutes; no short database poll keeps an idle project awake.
export function startHubMediaMaintenance({cleanup,timers=globalThis,onResult=()=>{},onError=()=>{}}){
  let stopped=false;let timer;
  function schedule(delay){if(!stopped){timer=timers.setTimeout(tick,delay);timer.unref?.();}}
  async function tick(){
    if(stopped)return;
    let delay=86400000;
    try{
      const result=await cleanup.run({apply:true,limit:100});
      onResult(result);
      if(result.failed||result.claimed===100)delay=300000;
    }catch{delay=300000;onError();}
    schedule(delay);
  }
  schedule(60000);
  return {stop(){stopped=true;timers.clearTimeout(timer);}};
}
