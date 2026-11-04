import {useState} from 'react';
import {getHubFormalEvidence} from '../../api/client';
import HubFormalRetention from './HubFormalRetention';

export default function HubFormalEvidence({attempt,label}){
  const [evidence,setEvidence]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [open,setOpen]=useState(false);
  const load=async()=>{
    setBusy(true);setNotice('');try{const response=await getHubFormalEvidence(attempt.id);setEvidence(response.data);setOpen(true);}catch{setNotice('Private assessment evidence could not be loaded.');}finally{setBusy(false);}
  };
  const rows=evidence?.stages?.length?evidence.stages:evidence?.actions||[];
  return <section className="hub-workspace-panel" data-attempt-id={attempt.id}><h4>{label} · attempt {attempt.attempt_in_set}</h4>
    <p>Attempt {attempt.id.slice(0,8)}…{attempt.id.slice(-4)}{attempt.identity_id&&` · Learner ${evidence?.attempt?.hub_identities?.display_name||attempt.postulante?.display_name||`${attempt.identity_id.slice(0,8)}…${attempt.identity_id.slice(-4)}`}`}</p>
    <button type="button" disabled={busy} onClick={()=>open?setOpen(false):load()}>{open?'Hide recorded evidence':'Review recorded evidence'}</button>
    {notice&&<p role="status">{notice}</p>}
    {open&&evidence&&<><p>Policy revision {evidence.attempt.settings_snapshot?.evaluationRevision} · Result {evidence.attempt.score??'Pending'} · {evidence.attempt.status}</p>
      {evidence.evidenceRetention?.state==='disposed'?<p role="status">Detailed evidence was disposed under retention on {new Date(evidence.evidenceRetention.disposed_at).toLocaleString()}. Score and attempt history remain recorded.</p>:<>
      <h5>Theory responses</h5>{evidence.questions.map(question=><article key={question.id||question.code}><strong>{question.question}</strong><p>Recorded answer: {question.choices.find(choice=>choice.id===question.submittedOption)?.label||'Not submitted'}</p><p>Correct answer: {question.choices.find(choice=>choice.id===question.correctOption)?.label||'Unavailable'} · question version {question.version}</p></article>)}
      <h5>Recorded practical evidence</h5><div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Operation / stage</th><th>Action</th><th>Result</th><th>Player</th><th>Amount</th><th>Game credit before / after</th><th>Backend decision / reason</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.sequence_number}{row.stage_number?` / ${row.stage_number}`:''}</td><td>{(row.action_code||row.item_code).replaceAll('_',' ')}</td><td>{row.is_correct?'Correct':'Unsuccessful'}</td><td>{row.evidence?.identifier||'—'}</td><td>{row.evidence?.amount??'—'}</td><td>{row.evidence?.creditBefore??'—'} / {row.evidence?.creditAfter??'—'}</td><td>{row.evidence?.decision||'—'}{row.evidence?.reason&&` · ${row.evidence.reason}`}</td></tr>)}</tbody></table></div>
      </>}
      <HubFormalRetention attemptId={attempt.id} onDisposed={receipt=>setEvidence(current=>({...current,questions:[],actions:[],stages:[],evidenceRetention:receipt}))}/>
    </>}
  </section>;
}
