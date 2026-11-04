import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useEffect,useRef,useState} from 'react';
import {getHubCoachingRetention,changeHubCoachingRetention} from '../../api/client';

const blockers={missing_revision:'Missing revision',open_coaching:'Coaching is still open',retention_not_elapsed:'Two-year retention has not elapsed',retention_hold:'An active hold protects this learner',linked_attempt_protected:'Linked attempt is still protected'};
const shortId=id=>`${id.slice(0,8)}…${id.slice(-4)}`;
export default function HubCoachingRetention({learnerId,canEdit,locale='en',onDisposed}){
  const {t} = useHubLocale();
  const es=locale==='es';const [data,setData]=useState(null);const [cursor,setCursor]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [action,setAction]=useState(null);const [reason,setReason]=useState('');const retry=useRef(null);const reasonInput=useRef(null);
  useEffect(()=>{if(action)reasonInput.current?.focus();},[action]);
  const load=async(next=null)=>{const response=await getHubCoachingRetention(learnerId,next);setData(response.data);setCursor(next);};
  const open=async(next=null)=>{setBusy(true);setNotice('');try{await load(next);setAction(null);}catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||(hubMessage("Retention preview could not be loaded.")), hubMessage("Retention preview could not be loaded.")));}finally{setBusy(false);}};
  const choose=(command,targetId,label)=>{setAction({command,targetId,label});setReason('');retry.current=null;setNotice('');};
  const submit=async event=>{
    event.preventDefault();setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{
      const result=(await changeHubCoachingRetention(learnerId,{...action,reason,idempotencyKey:retry.current})).data;
      if(result.status==='disposed')onDisposed(result.note_id);
      await load(cursor);setAction(null);setReason('');retry.current=null;setNotice(hubMessage("Retention action recorded."));
    }catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||(hubMessage("The retention action could not be recorded. Retry.")), hubMessage("The retention action could not be recorded. Retry.")));}finally{setBusy(false);}
  };
  const label={hold:es?'Confirmar retención':'Confirm retention hold',release:es?'Liberar retención':'Release hold',request:es?'Enviar solicitud':'Send disposal request',approve:es?'Aprobar y eliminar':'Approve and dispose',cancel:es?'Cancelar solicitud':'Cancel request'};
  return <section aria-label={t("Coaching retention")}>
    <h3>{t("Coaching retention & disposal")}</h3>
    <p>{t("Only closed or verified notes can be disposed, at least two years after their latest revision. Linked attempts and holds can protect them longer. Different TRAINERs must request and approve disposal.")}</p>
    <button type="button" disabled={busy} onClick={()=>open(cursor)}>{data?(t("Refresh retention preview")):(t("Open retention preview"))}</button>
    {notice&&<p role="status">{t(notice)}</p>}
    {data&&<>
      {canEdit&&!data.holds.length&&<button type="button" disabled={busy} onClick={()=>choose('hold',null,es?'Proteger todas las notas de este participante':'Protect every coaching note for this learner')}>{t("Place retention hold")}</button>}
      {data.holds.map(hold=><div key={hold.id}><strong>{t("Active retention hold")}</strong><p>{hold.reason}</p>{canEdit&&<button type="button" disabled={busy} onClick={()=>choose('release',hold.id,hubMessage('Release the learner retention hold'))}>{t("Review hold release")}</button>}</div>)}
      <ul className="hub-version-list">{data.notes.map(note=>{
        const pending=data.requests.find(request=>request.note_id===note.noteId);
        return <li key={note.noteId}><strong>{t("Note")} {shortId(note.noteId)}{t(" · v")}{note.latestRevision}</strong><p>{t("Retain until")} {new Date(note.retainUntil).toLocaleDateString(es?'es-PE':'en-US')}</p>
          {note.blockers.length>0?<p>{note.blockers.map(code=>t(blockers[code]||code)).join(' · ')}</p>:<p>{t("Eligible for disposal review")}</p>}
          {canEdit&&!pending&&<button type="button" disabled={busy||!note.eligible} onClick={()=>choose('request',note.noteId,hubMessage('Request disposal of note {0}',[shortId(note.noteId)]))}>{t("Request disposal")}</button>}
          {pending&&<div><p>{t("Pending request")}: {pending.reason}</p>{canEdit&&<>
            <button type="button" disabled={busy||!note.eligible||pending.requested_by===data.viewerId} onClick={()=>choose('approve',pending.id,hubMessage('Permanently dispose note {0}',[shortId(note.noteId)]))}>{t("Review disposal")}</button>
            {pending.requested_by===data.viewerId&&<p>{t("Another TRAINER must approve this request.")}</p>}
            <button type="button" disabled={busy} onClick={()=>choose('cancel',pending.id,hubMessage('Cancel the disposal request'))}>{t("Review request cancellation")}</button>
          </>}</div>}
        </li>;
      })}</ul>
      {data.notes.length===0&&<p>{t("No coaching notes on this page.")}</p>}
      {data.nextCursor&&<button type="button" disabled={busy} onClick={()=>open(data.nextCursor)}>{t("Next retention page")}</button>}
      {cursor&&<button type="button" disabled={busy} onClick={()=>open()}>{t("First retention page")}</button>}
      {data.receipts.length>0&&<details><summary>{t("Latest 50 disposal decisions")}</summary><ul>{data.receipts.map(receipt=><li key={receipt.id}>{shortId(receipt.note_id)} · {t(receipt.status)} · {receipt.disposed_revisions??0} {t("revisions removed")}</li>)}</ul></details>}
    </>}
    {action&&<form onSubmit={submit}><fieldset disabled={busy}><legend>{t(action.label)}</legend>
      {action.command==='approve'&&<p>{t("This permanently removes the note text and every revision. Assessment results remain unchanged.")}</p>}
      <label>{t("Brief reason (do not copy coaching text)")}<textarea ref={reasonInput} required minLength={5} maxLength={500} value={reason} onChange={event=>{setReason(event.target.value);retry.current=null;}}/></label>
      <button type="submit">{t(label[action.command])}</button><button type="button" onClick={()=>{setAction(null);retry.current=null;}}>{t("Cancel action")}</button>
    </fieldset></form>}
  </section>;
}
