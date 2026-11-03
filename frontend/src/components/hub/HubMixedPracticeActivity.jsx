import {useEffect,useRef,useState} from 'react';
import {getHubMixedPractice,commandHubMixedPractice} from '../../api/client';
import {HubPracticeActionForm} from './HubEvaluationRuntime';

export default function HubMixedPracticeActivity({activity,busy:parentBusy,onComplete}){
  const [view,setView]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const pending=useRef(null);
  useEffect(()=>{let active=true;getHubMixedPractice(activity.id).then(response=>{if(active)setView(response.data);}).catch(()=>{if(active)setNotice('Practice progress could not be loaded.');});return()=>{active=false;};},[activity.id]);
  const execute=async(command,body={})=>{
    const input=command==='start'?{}:{...body,runId:view.runId,...(command==='abandon'?{}:{worldId:view.task.worldId,stage:view.task.stage})};
    const fingerprint=JSON.stringify([command,input]);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};
    setBusy(true);setNotice('');
    try{
      const response=await commandHubMixedPractice(activity.id,command,{...input,idempotencyKey:pending.current.key});pending.current=null;
      if(command!=='history'){
        setView(response.data);
        if(response.data.learningCompletionRecorded&&!activity.completed)await onComplete({serverCompleted:true});
      }
      return response.data;
    }catch(error){setNotice(error?.response?.data?.error?.message||'This practice action could not be recorded. Retry it.');return null;}finally{setBusy(false);}
  };
  return <section className="hub-workspace-panel" aria-label="Mixed operation practice"><p>Untimed practice. Each run is saved separately and uses no formal assessment attempts.</p>
    {notice&&<p role="status">{notice}</p>}
    {!view&&!notice&&<p role="status">Loading practice progress…</p>}
    {view?.status==='in_progress'?<><p>Actions recorded: {view.completedActions} / {view.totalActions}</p>
      {view.lastStageCorrect!==null&&<p role="status">{view.lastStageCorrect?'The previous action matched the assigned operation.':'The previous action did not match. Review the player, amount and histories before your next decision.'}</p>}
      {view.task&&<HubPracticeActionForm key={`${view.runId}:${view.completedActions}`} task={view.task} busy={busy||parentBusy} execute={execute} history={()=>execute('history')}/>}
      <button type="button" disabled={busy||parentBusy} onClick={()=>execute('abandon')}>End this practice run</button>
    </>:view&&<>
      {view.status!=='not_started'&&<p>{view.result?'Practice completed successfully.':'This run is saved. Start another run to practice again.'}</p>}
      <button type="button" disabled={busy||parentBusy} onClick={()=>execute('start')}>{view.status==='not_started'?'Start mixed practice':'Start another practice run'}</button>
    </>}
  </section>;
}
