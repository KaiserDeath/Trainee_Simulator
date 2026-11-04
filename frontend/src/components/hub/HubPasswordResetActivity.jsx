import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useRef,useState } from 'react';
import { commandHubCredentialPractice } from '../../api/client';

export default function HubPasswordResetActivity({activity,disabled,onComplete}){
  const {t} = useHubLocale();
  const [context,setContext]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [form,setForm]=useState({identifier:'',password:'',kiosk:''});
  const retry=useRef(null);
  const update=key=>event=>{setForm(current=>({...current,[key]:event.target.value}));retry.current=null;};
  const act=async(command)=>{
    setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{
      const response=await commandHubCredentialPractice(activity.id,command,{...(command==='start'?{}:form),idempotencyKey:retry.current});
      setContext(response.data);retry.current=null;setForm(current=>({...current,password:''}));
      if(command==='reset')setNotice(hubMessage("Game password reset recorded. Confirm the matching request in Backend."));
      if(command==='confirm'){setNotice(hubMessage("Backend request confirmed. No password literal was retained in learning evidence."));await onComplete({serverCompleted:true});}
    }catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("Password practice could not complete the action."), hubMessage("Password practice could not complete the action.")));}
    finally{setBusy(false);}
  };
  return <div className="hub-workspace-form">
    {!context&&<button type="button" disabled={busy||(disabled&&!activity.completed)} onClick={()=>act('start')}>{t("Open assigned password reset practice")}</button>}
    {notice&&<p role="status">{t(notice)}</p>}
    {context&&<>
      <dl><div><dt>{t("Assigned game")}</dt><dd>{context.game}</dd></div><div><dt>{t("Exact player")}</dt><dd>{context.identifier}</dd></div><div><dt>{t("Backend request")}</dt><dd>{t(context.operation.type)} · {t(context.operation.status)}</dd></div></dl>
      {!context.confirmed&&<form onSubmit={event=>{event.preventDefault();act(context.resetPerformed?'confirm':'reset');}}><fieldset disabled={disabled||busy}>
        <legend>{context.resetPerformed?t("Backend — password reset confirmation"):t("Orion Stars — reset assigned player password")}</legend>
        <label>{t("Exact Game ID")}<input required value={form.identifier} onChange={update('identifier')}/></label>
        <label>{context.resetPerformed?t("Password entered in the game"):t("New game password")}<input required type="password" autoComplete="off" value={form.password} onChange={update('password')} maxLength={200}/></label>
        {context.resetPerformed&&<label>{t("Kiosk")}<input required value={form.kiosk} onChange={update('kiosk')}/></label>}
        <button type="submit">{context.resetPerformed?t("Confirm Backend reset request"):t("Reset game password")}</button>
      </fieldset></form>}
      {context.confirmed&&<p>{t("Completed with server-verified game and Backend evidence.")}</p>}
    </>}
  </div>;
}
