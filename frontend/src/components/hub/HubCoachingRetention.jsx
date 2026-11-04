import {useEffect,useRef,useState} from 'react';
import {getHubCoachingRetention,changeHubCoachingRetention} from '../../api/client';

const blockers={missing_revision:'Missing revision',open_coaching:'Coaching is still open',retention_not_elapsed:'Two-year retention has not elapsed',retention_hold:'An active hold protects this learner',linked_attempt_protected:'Linked attempt is still protected'};
const blockersEs={missing_revision:'Falta una revisión',open_coaching:'Seguimiento abierto',retention_not_elapsed:'Aún no transcurrieron dos años',retention_hold:'Participante protegido por una retención',linked_attempt_protected:'Intento relacionado protegido'};
const shortId=id=>`${id.slice(0,8)}…${id.slice(-4)}`;
export default function HubCoachingRetention({learnerId,canEdit,locale='en',onDisposed}){
  const es=locale==='es';const [data,setData]=useState(null);const [cursor,setCursor]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [action,setAction]=useState(null);const [reason,setReason]=useState('');const retry=useRef(null);const reasonInput=useRef(null);
  useEffect(()=>{if(action)reasonInput.current?.focus();},[action]);
  const load=async(next=null)=>{const response=await getHubCoachingRetention(learnerId,next);setData(response.data);setCursor(next);};
  const open=async(next=null)=>{setBusy(true);setNotice('');try{await load(next);setAction(null);}catch(error){setNotice(error?.response?.data?.error?.message||(es?'No se pudo cargar la retención.':'Retention preview could not be loaded.'));}finally{setBusy(false);}};
  const choose=(command,targetId,label)=>{setAction({command,targetId,label});setReason('');retry.current=null;setNotice('');};
  const submit=async event=>{
    event.preventDefault();setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{
      const result=(await changeHubCoachingRetention(learnerId,{...action,reason,idempotencyKey:retry.current})).data;
      if(result.status==='disposed')onDisposed(result.note_id);
      await load(cursor);setAction(null);setReason('');retry.current=null;setNotice(es?'Acción de retención registrada.':'Retention action recorded.');
    }catch(error){setNotice(error?.response?.data?.error?.message||(es?'No se pudo registrar. Reintente.':'The retention action could not be recorded. Retry.'));}finally{setBusy(false);}
  };
  const label={hold:es?'Confirmar retención':'Confirm retention hold',release:es?'Liberar retención':'Release hold',request:es?'Enviar solicitud':'Send disposal request',approve:es?'Aprobar y eliminar':'Approve and dispose',cancel:es?'Cancelar solicitud':'Cancel request'};
  return <section aria-label={es?'Retención de seguimiento':'Coaching retention'}>
    <h3>{es?'Retención y eliminación de notas':'Coaching retention & disposal'}</h3>
    <p>{es?'Solo notas cerradas o verificadas, conservadas al menos dos años desde su última revisión. Los intentos relacionados y las retenciones pueden impedir su eliminación. Dos TRAINER distintos deben solicitar y aprobar.':'Only closed or verified notes can be disposed, at least two years after their latest revision. Linked attempts and holds can protect them longer. Different TRAINERs must request and approve disposal.'}</p>
    <button type="button" disabled={busy} onClick={()=>open(cursor)}>{data?(es?'Actualizar retención':'Refresh retention preview'):(es?'Abrir retención':'Open retention preview')}</button>
    {notice&&<p role="status">{notice}</p>}
    {data&&<>
      {canEdit&&!data.holds.length&&<button type="button" disabled={busy} onClick={()=>choose('hold',null,es?'Proteger todas las notas de este participante':'Protect every coaching note for this learner')}>{es?'Aplicar retención':'Place retention hold'}</button>}
      {data.holds.map(hold=><div key={hold.id}><strong>{es?'Retención activa':'Active retention hold'}</strong><p>{hold.reason}</p>{canEdit&&<button type="button" disabled={busy} onClick={()=>choose('release',hold.id,es?'Liberar la retención del participante':'Release the learner retention hold')}>{es?'Revisar liberación':'Review hold release'}</button>}</div>)}
      <ul className="hub-version-list">{data.notes.map(note=>{
        const pending=data.requests.find(request=>request.note_id===note.noteId);
        return <li key={note.noteId}><strong>{es?'Nota':'Note'} {shortId(note.noteId)} · v{note.latestRevision}</strong><p>{es?'Conservar hasta':'Retain until'} {new Date(note.retainUntil).toLocaleDateString(es?'es-PE':'en-US')}</p>
          {note.blockers.length>0?<p>{note.blockers.map(code=>(es?blockersEs:blockers)[code]||code).join(' · ')}</p>:<p>{es?'Elegible para revisión':'Eligible for disposal review'}</p>}
          {canEdit&&!pending&&<button type="button" disabled={busy||!note.eligible} onClick={()=>choose('request',note.noteId,`${es?'Solicitar eliminación de nota':'Request disposal of note'} ${shortId(note.noteId)}`)}>{es?'Solicitar eliminación':'Request disposal'}</button>}
          {pending&&<div><p>{es?'Solicitud pendiente':'Pending request'}: {pending.reason}</p>{canEdit&&<>
            <button type="button" disabled={busy||!note.eligible||pending.requested_by===data.viewerId} onClick={()=>choose('approve',pending.id,`${es?'Eliminar permanentemente la nota':'Permanently dispose note'} ${shortId(note.noteId)}`)}>{es?'Revisar eliminación':'Review disposal'}</button>
            {pending.requested_by===data.viewerId&&<p>{es?'Otro TRAINER debe aprobar.':'Another TRAINER must approve this request.'}</p>}
            <button type="button" disabled={busy} onClick={()=>choose('cancel',pending.id,es?'Cancelar solicitud de eliminación':'Cancel the disposal request')}>{es?'Revisar cancelación':'Review request cancellation'}</button>
          </>}</div>}
        </li>;
      })}</ul>
      {data.notes.length===0&&<p>{es?'Sin notas en esta página.':'No coaching notes on this page.'}</p>}
      {data.nextCursor&&<button type="button" disabled={busy} onClick={()=>open(data.nextCursor)}>{es?'Siguiente página de retención':'Next retention page'}</button>}
      {cursor&&<button type="button" disabled={busy} onClick={()=>open()}>{es?'Primera página de retención':'First retention page'}</button>}
      {data.receipts.length>0&&<details><summary>{es?'Últimas 50 decisiones':'Latest 50 disposal decisions'}</summary><ul>{data.receipts.map(receipt=><li key={receipt.id}>{shortId(receipt.note_id)} · {receipt.status} · {receipt.disposed_revisions??0} {es?'revisiones eliminadas':'revisions removed'}</li>)}</ul></details>}
    </>}
    {action&&<form onSubmit={submit}><fieldset disabled={busy}><legend>{action.label}</legend>
      {action.command==='approve'&&<p>{es?'Se eliminarán el texto y todas las revisiones de esta nota. Los resultados de evaluación se conservan.':'This permanently removes the note text and every revision. Assessment results remain unchanged.'}</p>}
      <label>{es?'Motivo breve (sin copiar el texto de la nota)':'Brief reason (do not copy coaching text)'}<textarea ref={reasonInput} required minLength={5} maxLength={500} value={reason} onChange={event=>{setReason(event.target.value);retry.current=null;}}/></label>
      <button type="submit">{label[action.command]}</button><button type="button" onClick={()=>{setAction(null);retry.current=null;}}>{es?'Cancelar acción':'Cancel action'}</button>
    </fieldset></form>}
  </section>;
}
