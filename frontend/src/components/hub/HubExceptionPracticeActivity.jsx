import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useRef,useState} from 'react';
import {commandHubExceptionPractice} from '../../api/client';

export default function HubExceptionPracticeActivity({activity,disabled,onComplete}){
  const {locale,t} = useHubLocale();
  const [context,setContext]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [reason,setReason]=useState('');const pending=useRef(null);
  const act=async(command,action)=>{
    setBusy(true);setNotice('');pending.current ||= crypto.randomUUID();
    try{const response=await commandHubExceptionPractice(activity.id,command,{...(action?{action,reason}:{}),idempotencyKey:pending.current});setContext(response.data);pending.current=null;
      if(response.data.result===true){setNotice(hubMessage("The decision matches the recorded game evidence."));await onComplete({serverCompleted:true});}
      else if(response.data.result===false)setNotice(hubMessage("Review the history and scenario, then try another practice case."));
    }catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("The exception practice could not complete this action."), hubMessage("The exception practice could not complete this action.")));}finally{setBusy(false);}
  };
  const reconcile=context?.scenario==='PENDING_RECONCILIATION';
  return <div className="hub-workspace-form">
    <p>{t("Inspect the game evidence before deciding. Do not repeat an already-applied movement or operate a pending reconciliation.")}</p>
    {(!context||context.result===false)&&<button type="button" disabled={busy||disabled} onClick={()=>{pending.current=null;setReason('');act('start');}}>{context?t("Try another practice case"):t("Start exception practice")}</button>}
    {notice&&<p role="status">{t(notice)}</p>}
    {context&&<>
      <dl><div><dt>{t("Scenario")}</dt><dd>{context.scenario.replaceAll('_',' ')}</dd></div><div><dt>{t("Exact player")}</dt><dd>{context.identifier}</dd></div><div><dt>{t("Requested credits")}</dt><dd>{context.amount}</dd></div><div><dt>{t("Game credit at request / current")}</dt><dd>{context.creditAtRequest} / {context.credit}</dd></div></dl>
      <table><caption>{t("Recorded game history for this practice account")}</caption><thead><tr><th>{t("Action")}</th><th>{t("Credits")}</th><th>{t("Time")}</th></tr></thead><tbody>{context.history.map(row=><tr key={row.id}><td>{t(row.type)}</td><td>{row.amount}</td><td>{new Date(row.createdAt).toLocaleString(locale==='es'?'es-PE':'en-US')}</td></tr>)}</tbody></table>
      {context.history.length===0&&<p>{t("No matching game action is recorded.")}</p>}
      {context.status==='PENDING'&&<fieldset disabled={busy||disabled}>
        <legend>{t("Backend decision")}</legend><label>{t("Evidence-based reason")}<textarea required maxLength={1000} value={reason} onChange={event=>{setReason(event.target.value);pending.current=null;}}/></label>
        <button type="button" disabled={!reason.trim()} onClick={()=>act('answer','APPROVED')}>{reconcile?t("It applied"):t("Approve existing movement")}</button>
        <button type="button" disabled={!reason.trim()} onClick={()=>act('answer','CANCELLED')}>{reconcile?t("It did not apply"):t("Cancel movement")}</button>
      </fieldset>}
    </>}
  </div>;
}
