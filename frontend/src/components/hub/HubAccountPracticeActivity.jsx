import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useRef,useState } from 'react';
import { commandHubAccountPractice } from '../../api/client';
import HubAccountIdLabActivity from './HubAccountIdLabActivity';

export default function HubAccountPracticeActivity({activity,disabled,onComplete}){
  const {t} = useHubLocale();
  const [context,setContext]=useState(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  const [confirmId,setConfirmId]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [kiosk,setKiosk]=useState('');
  const pending=useRef(new Map());
  const command=async(action,input={},complete=false)=>{
    setBusy(true);setNotice('');
    const fingerprint=JSON.stringify([action,input]);
    const key=pending.current.get(fingerprint)||crypto.randomUUID();pending.current.set(fingerprint,key);
    try{
      const response=await commandHubAccountPractice(activity.id,action,{...input,idempotencyKey:key});
      setContext(response.data);pending.current.delete(fingerprint);
      if(action==='create'){setPassword('');setNotice(hubMessage("Account created. Return to the Backend confirmation form below."));}
      if(action==='confirm'){setConfirmPassword('');setNotice(hubMessage("Backend confirmed. Copy the created identifier for the next search module."));}
      if(complete)await onComplete({serverCompleted:true});
    }catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("Account practice is unavailable. Retry this action."), hubMessage("Account practice is unavailable. Retry this action.")));}
    finally{setBusy(false);}
  };
  const lab=activity.content?.executionKind==='account_id_lab';
  return <div className="hub-workspace-form">
    {!context&&<button type="button" disabled={busy||(disabled&&!activity.completed)} onClick={()=>command('start')}>{activity.completed?t("View completed account practice"):lab?t("Start assigned Account ID Lab"):t("Open linked Orion account practice")}</button>}
    {notice&&<p role="status">{t(notice)}</p>}
    {context&&lab&&<HubAccountIdLabActivity activity={{...activity,content:{...activity.content,policyStatus:'approved',policy:context.policy,policyVersionId:context.policyVersionId,customerUsername:context.customerUsername}}} disabled={disabled||busy} onComplete={state=>command('validate',{identifier:state.answer},true)}/>}
    {context&&!lab&&<>
      <dl><div><dt>{t("Assigned customer")}</dt><dd>{context.customerUsername}</dd></div><div><dt>{t("Game")}</dt><dd>{context.game}</dd></div><div><dt>{t("Backend request")}</dt><dd>{t(context.operation.type)} · {t(context.operation.status)}</dd></div></dl>
      {!context.labVerified&&<p role="status">{t("Complete the assigned Account ID Lab first.")}</p>}
      {!context.account&&<form onSubmit={event=>{event.preventDefault();command('create',{identifier,password});}}>
        <fieldset disabled={disabled||busy||!context.labVerified}>
          <legend>{t("Orion Stars — Create player")}</legend>
          <label>{t("Game ID")}<input required value={identifier} onChange={event=>{setIdentifier(event.target.value);pending.current.clear();}} maxLength={200}/></label>
          <label>{t("Game password")}<input required type="password" autoComplete="new-password" value={password} onChange={event=>{setPassword(event.target.value);pending.current.clear();}} maxLength={200}/></label>
          <button type="submit">{t("Create player")}</button>
        </fieldset>
      </form>}
      {context.account&&<>
        <p>{t("Created Game ID: ")}<strong>{context.account.identifier}</strong></p>
        <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(context.account.identifier);setNotice(hubMessage("Created Game ID copied."));}catch{setNotice(hubMessage("Select and copy the Game ID above."));}}}>{t("Copy created Game ID")}</button>
        {!context.artifactId&&<form onSubmit={event=>{event.preventDefault();command('confirm',{identifier:confirmId,password:confirmPassword,kiosk},true);}}>
          <fieldset disabled={disabled||busy}>
            <legend>{t("Backend — pencil form / Confirm")}</legend>
            <label>{t("Created Game ID")}<input required value={confirmId} onChange={event=>{setConfirmId(event.target.value);pending.current.clear();}}/></label>
            <label>{t("Created password")}<input required type="password" autoComplete="off" value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);pending.current.clear();}}/></label>
            <label>{t("Kiosk")}<input required value={kiosk} onChange={event=>{setKiosk(event.target.value);pending.current.clear();}} placeholder={t("Enter the game kiosk")}/></label>
            <button type="submit">{t("Confirm Backend request")}</button>
          </fieldset>
        </form>}
      </>}
    </>}
  </div>;
}
