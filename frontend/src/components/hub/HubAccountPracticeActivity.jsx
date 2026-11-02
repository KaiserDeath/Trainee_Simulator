import { useRef,useState } from 'react';
import { commandHubAccountPractice } from '../../api/client';
import HubAccountIdLabActivity from './HubAccountIdLabActivity';

export default function HubAccountPracticeActivity({activity,disabled,onComplete}){
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
      if(action==='create'){setPassword('');setNotice('Account created. Return to the Backend confirmation form below.');}
      if(action==='confirm'){setConfirmPassword('');setNotice('Backend confirmed. Copy the created identifier for the next search module.');}
      if(complete)await onComplete({serverCompleted:true});
    }catch(error){setNotice(error?.response?.data?.error?.message||'Account practice is unavailable. Retry this action.');}
    finally{setBusy(false);}
  };
  const lab=activity.content?.executionKind==='account_id_lab';
  return <div className="hub-workspace-form">
    {!context&&<button type="button" disabled={busy||(disabled&&!activity.completed)} onClick={()=>command('start')}>{activity.completed?'View completed account practice':lab?'Start assigned Account ID Lab':'Open linked Orion account practice'}</button>}
    {notice&&<p role="status">{notice}</p>}
    {context&&lab&&<HubAccountIdLabActivity activity={{...activity,content:{...activity.content,policyStatus:'approved',policy:context.policy,policyVersionId:context.policyVersionId,customerUsername:context.customerUsername}}} disabled={disabled||busy} onComplete={state=>command('validate',{identifier:state.answer},true)}/>}
    {context&&!lab&&<>
      <dl><div><dt>Assigned customer</dt><dd>{context.customerUsername}</dd></div><div><dt>Game</dt><dd>{context.game}</dd></div><div><dt>Backend request</dt><dd>{context.operation.type} · {context.operation.status}</dd></div></dl>
      {!context.labVerified&&<p role="status">Complete the assigned Account ID Lab first.</p>}
      {!context.account&&<form onSubmit={event=>{event.preventDefault();command('create',{identifier,password});}}>
        <fieldset disabled={disabled||busy||!context.labVerified}>
          <legend>Orion Stars — Create player</legend>
          <label>Game ID<input required value={identifier} onChange={event=>{setIdentifier(event.target.value);pending.current.clear();}} maxLength={200}/></label>
          <label>Game password<input required type="password" autoComplete="new-password" value={password} onChange={event=>{setPassword(event.target.value);pending.current.clear();}} maxLength={200}/></label>
          <button type="submit">Create player</button>
        </fieldset>
      </form>}
      {context.account&&<>
        <p>Created Game ID: <strong>{context.account.identifier}</strong></p>
        <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(context.account.identifier);setNotice('Created Game ID copied.');}catch{setNotice('Select and copy the Game ID above.');}}}>Copy created Game ID</button>
        {!context.artifactId&&<form onSubmit={event=>{event.preventDefault();command('confirm',{identifier:confirmId,password:confirmPassword,kiosk},true);}}>
          <fieldset disabled={disabled||busy}>
            <legend>Backend — pencil form / Confirm</legend>
            <label>Created Game ID<input required value={confirmId} onChange={event=>{setConfirmId(event.target.value);pending.current.clear();}}/></label>
            <label>Created password<input required type="password" autoComplete="off" value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);pending.current.clear();}}/></label>
            <label>Kiosk<input required value={kiosk} onChange={event=>{setKiosk(event.target.value);pending.current.clear();}} placeholder="Enter the game kiosk"/></label>
            <button type="submit">Confirm Backend request</button>
          </fieldset>
        </form>}
      </>}
    </>}
  </div>;
}
