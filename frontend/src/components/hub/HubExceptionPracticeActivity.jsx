import {useRef,useState} from 'react';
import {commandHubExceptionPractice} from '../../api/client';

export default function HubExceptionPracticeActivity({activity,disabled,onComplete}){
  const [context,setContext]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [reason,setReason]=useState('');const pending=useRef(null);
  const act=async(command,action)=>{
    setBusy(true);setNotice('');pending.current ||= crypto.randomUUID();
    try{const response=await commandHubExceptionPractice(activity.id,command,{...(action?{action,reason}:{}),idempotencyKey:pending.current});setContext(response.data);pending.current=null;
      if(response.data.result===true){setNotice('The decision matches the recorded game evidence.');await onComplete({serverCompleted:true});}
      else if(response.data.result===false)setNotice('Review the history and scenario, then try another practice case.');
    }catch(error){setNotice(error?.response?.data?.error?.message||'The exception practice could not complete this action.');}finally{setBusy(false);}
  };
  const reconcile=context?.scenario==='PENDING_RECONCILIATION';
  return <div className="hub-workspace-form">
    <p>Inspect the game evidence before deciding. Do not repeat an already-applied movement or operate a pending reconciliation.</p>
    {(!context||context.result===false)&&<button type="button" disabled={busy||disabled} onClick={()=>{pending.current=null;setReason('');act('start');}}>{context?'Try another practice case':'Start exception practice'}</button>}
    {notice&&<p role="status">{notice}</p>}
    {context&&<>
      <dl><div><dt>Scenario</dt><dd>{context.scenario.replaceAll('_',' ')}</dd></div><div><dt>Exact player</dt><dd>{context.identifier}</dd></div><div><dt>Requested credits</dt><dd>{context.amount}</dd></div><div><dt>Game credit at request / current</dt><dd>{context.creditAtRequest} / {context.credit}</dd></div></dl>
      <table><caption>Recorded game history for this practice account</caption><thead><tr><th>Action</th><th>Credits</th><th>Time</th></tr></thead><tbody>{context.history.map(row=><tr key={row.id}><td>{row.type}</td><td>{row.amount}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table>
      {context.history.length===0&&<p>No matching game action is recorded.</p>}
      {context.status==='PENDING'&&<fieldset disabled={busy||disabled}>
        <legend>Backend decision</legend><label>Evidence-based reason<textarea required maxLength={1000} value={reason} onChange={event=>{setReason(event.target.value);pending.current=null;}}/></label>
        <button type="button" disabled={!reason.trim()} onClick={()=>act('answer','APPROVED')}>{reconcile?'It applied':'Approve existing movement'}</button>
        <button type="button" disabled={!reason.trim()} onClick={()=>act('answer','CANCELLED')}>{reconcile?'It did not apply':'Cancel movement'}</button>
      </fieldset>}
    </>}
  </div>;
}
