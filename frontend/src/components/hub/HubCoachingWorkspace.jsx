import { useRef,useState } from 'react';
import { getHubPostulanteAccounts,getHubCoachingNotes,getHubCoachingEvidence,saveHubCoachingNote } from '../../api/client';
import HubCoachingRetention from './HubCoachingRetention';

const blank={noteId:null,attemptId:'',expectedRevision:0,body:'',status:'open',verificationAttemptId:''};
export default function HubCoachingWorkspace({ canEdit,locale='en' }){
  const es=locale==='es';
  const [learners,setLearners]=useState(null);
  const [learnerId,setLearnerId]=useState('');
  const [notes,setNotes]=useState([]);
  const [attempts,setAttempts]=useState([]);
  const [cursor,setCursor]=useState(null);
  const [form,setForm]=useState(blank);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const request=useRef(0);
  const retry=useRef(null);
  const fail=error=>setNotice(error?.response?.data?.error?.message||(es?'No se pudo cargar o guardar.':'Could not load or save. Please retry.'));
  const open=async()=>{setBusy(true);setNotice('');try{setLearners((await getHubPostulanteAccounts()).data.postulantes||[]);}catch(error){fail(error);}finally{setBusy(false);}};
  const select=async(id)=>{
    const current=++request.current;setLearnerId(id);setNotes([]);setAttempts([]);setCursor(null);setForm(blank);retry.current=null;setNotice('');
    if(!id)return;
    setBusy(true);
    try{const [n,e]=await Promise.all([getHubCoachingNotes(id),getHubCoachingEvidence(id)]);if(current===request.current){setNotes(n.data.notes);setCursor(n.data.nextCursor);setAttempts(e.data.attempts);}}
    catch(error){if(current===request.current)fail(error);}finally{if(current===request.current)setBusy(false);}
  };
  const more=async()=>{setBusy(true);try{const result=(await getHubCoachingNotes(learnerId,cursor)).data;setNotes(current=>[...current,...result.notes]);setCursor(result.nextCursor);}catch(error){fail(error);}finally{setBusy(false);}};
  const update=key=>event=>{setForm(current=>({...current,[key]:event.target.value}));retry.current=null;};
  const edit=note=>{const latest=note.revisions[0];setForm({noteId:note.id,attemptId:note.attempt_id||'',expectedRevision:latest.revision,body:latest.body,status:latest.status,verificationAttemptId:latest.verification_attempt_id||''});retry.current=null;};
  const save=async event=>{
    event.preventDefault();setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{await saveHubCoachingNote(learnerId,{...form,idempotencyKey:retry.current});const result=(await getHubCoachingNotes(learnerId)).data;setNotes(result.notes);setCursor(result.nextCursor);setForm(blank);retry.current=null;setNotice(es?'Nota privada guardada.':'Private note saved.');}
    catch(error){fail(error);}finally{setBusy(false);}
  };
  const attemptOptions=attempts.map(attempt=><option key={attempt.id} value={attempt.id}>{attempt.id.slice(0,8)} · {attempt.status} · {attempt.completed_at?new Date(attempt.completed_at).toLocaleString():es?'En curso':'In progress'}</option>);
  return <section className="hub-workspace-panel">
    <h2>{es?'Seguimiento privado':'Private coaching'}</h2>
    <p>{es?'Notas con historial de versiones, visibles para TRAINER y RRHH. No cambian las notas de evaluación.':'Versioned notes visible to TRAINER and RRHH. Coaching does not change assessment scores. Keep passwords and confidential credentials out of notes.'}</p>
    <button type="button" disabled={busy} onClick={open}>{es?'Abrir seguimiento':'Open coaching workspace'}</button>
    {notice&&<p role="status">{notice}</p>}
    {learners&&<label>{es?'Participante':'Postulante'}<select disabled={busy} value={learnerId} onChange={event=>select(event.target.value)}><option value="">{es?'Seleccione un participante':'Choose a learner'}</option>{learners.map(row=><option key={row.id} value={row.id}>{row.displayName||row.display_name||row.username}</option>)}</select></label>}
    {learnerId&&canEdit&&<form onSubmit={save} className="hub-workspace-form"><fieldset disabled={busy}>
      <h3>{form.noteId?(es?'Nueva revisión':'New revision'):(es?'Nueva nota':'New note')}</h3>
      <label>{es?'Intento relacionado (opcional)':'Related attempt (optional)'}<select disabled={Boolean(form.noteId)} value={form.attemptId} onChange={update('attemptId')}><option value="">{es?'Seguimiento general':'General coaching'}</option>{attemptOptions}</select></label>
      <label>{es?'Nota':'Coaching note'}<textarea required maxLength={4000} rows={5} value={form.body} onChange={update('body')}/></label>
      <label>{es?'Estado':'Status'}<select value={form.status} onChange={update('status')}><option value="open">{es?'Abierto':'Open'}</option><option value="practice_assigned">{es?'Práctica asignada':'Practice assigned'}</option><option value="verified">{es?'Verificado':'Verified'}</option><option value="closed">{es?'Cerrado':'Closed'}</option></select></label>
      {form.status==='verified'&&<label>{es?'Intento posterior completado':'Later completed attempt'}<select required value={form.verificationAttemptId} onChange={update('verificationAttemptId')}><option value="">{es?'Seleccione evidencia':'Choose verification evidence'}</option>{attemptOptions}</select></label>}
      <button type="submit">{es?'Guardar nota privada':'Save private note'}</button>
      {form.noteId&&<button type="button" onClick={()=>{setForm(blank);retry.current=null;}}>{es?'Cancelar edición':'Cancel editing'}</button>}
    </fieldset></form>}
    {learnerId&&notes.length===0&&!busy&&<p>{es?'Sin notas guardadas.':'No saved coaching notes.'}</p>}
    <ul className="hub-version-list">{notes.map(note=>{const latest=note.revisions[0];return <li key={note.id}>
      <p><small>{es?'Nota':'Note'} {note.id.slice(0,8)}…{note.id.slice(-4)}</small></p><strong>{latest.status} · v{latest.revision}</strong><p className="hub-note-body">{latest.body}</p><p><small>{new Date(latest.created_at).toLocaleString()} · {es?'Retención mínima hasta':'Minimum retention until'} {new Date(note.retention_until).toLocaleDateString()}</small></p>
      {note.attempt_id&&<p>{es?'Intento':'Attempt'}: {note.attempt_id}</p>}
      {latest.verification_attempt_id&&<p>{es?'Evidencia de verificación':'Verification evidence'}: {latest.verification_attempt_id}</p>}
      {canEdit&&<button type="button" disabled={busy} onClick={()=>edit(note)}>{es?'Añadir revisión':'Add revision'}</button>}
      <details><summary>{es?'Historial':'Revision history'}</summary>{note.revisions.map(revision=><article key={revision.id}><strong>v{revision.revision} · {revision.status}</strong><p className="hub-note-body">{revision.body}</p><small>{new Date(revision.created_at).toLocaleString()}</small></article>)}</details>
    </li>;})}</ul>
    {cursor&&<button type="button" disabled={busy} onClick={more}>{es?'Cargar más notas':'Load more notes'}</button>}
    {learnerId&&<HubCoachingRetention key={learnerId} learnerId={learnerId} canEdit={canEdit} locale={locale} onDisposed={id=>{setNotes(current=>current.filter(note=>note.id!==id));setForm(current=>current.noteId===id?blank:current);retry.current=null;}}/>}
  </section>;
}
