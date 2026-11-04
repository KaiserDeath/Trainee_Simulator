import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useState} from 'react';
import {getHubFormalEvidence} from '../../api/client';
import HubFormalRetention from './HubFormalRetention';

export default function HubFormalEvidence({attempt,label}){
  const {locale,t} = useHubLocale();
  const [evidence,setEvidence]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [open,setOpen]=useState(false);
  const load=async()=>{
    setBusy(true);setNotice('');try{const response=await getHubFormalEvidence(attempt.id);setEvidence(response.data);setOpen(true);}catch{setNotice(hubMessage("Private assessment evidence could not be loaded."));}finally{setBusy(false);}
  };
  const rows=evidence?.stages?.length?evidence.stages:evidence?.actions||[];
  return <section className="hub-workspace-panel" data-attempt-id={attempt.id}><h4>{t(label)}{t(" · attempt ")}{attempt.attempt_in_set}</h4>
    <p>{t("Attempt ")}{attempt.id.slice(0,8)}…{attempt.id.slice(-4)}{attempt.identity_id&&t(" · Learner {0}", [evidence?.attempt?.hub_identities?.display_name||attempt.postulante?.display_name||`${attempt.identity_id.slice(0,8)}…${attempt.identity_id.slice(-4)}`])}</p>
    <button type="button" disabled={busy} onClick={()=>open?setOpen(false):load()}>{open?t("Hide recorded evidence"):t("Review recorded evidence")}</button>
    {notice&&<p role="status">{t(notice)}</p>}
    {open&&evidence&&<><p>{t("Policy revision ")}{evidence.attempt.settings_snapshot?.evaluationRevision}{t(" · Result ")}{evidence.attempt.score??t("Pending")} · {t(evidence.attempt.status)}</p>
      {evidence.evidenceRetention?.state==='disposed'?<p role="status">{t("Detailed evidence was disposed under retention on ")}{new Date(evidence.evidenceRetention.disposed_at).toLocaleString(locale==='es'?'es-PE':'en-US')}{t(". Score and attempt history remain recorded.")}</p>:<>
      <h5>{t("Theory responses")}</h5>{evidence.questions.map(question=><article key={question.id||question.code}><strong>{t(question.question)}</strong><p>{t("Recorded answer: ")}{t(question.choices.find(choice=>choice.id===question.submittedOption)?.label||t("Not submitted"))}</p><p>{t("Correct answer: ")}{t(question.choices.find(choice=>choice.id===question.correctOption)?.label||t("Unavailable"))}{t(" · question version ")}{question.version}</p></article>)}
      <h5>{t("Recorded practical evidence")}</h5><div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Operation / stage")}</th><th>{t("Action")}</th><th>{t("Result")}</th><th>{t("Player")}</th><th>{t("Amount")}</th><th>{t("Game credit before / after")}</th><th>{t("Backend decision / reason")}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.sequence_number}{row.stage_number?` / ${row.stage_number}`:''}</td><td>{(row.action_code||row.item_code).replaceAll('_',' ')}</td><td>{row.is_correct?t("Correct"):t("Unsuccessful")}</td><td>{row.evidence?.identifier||'—'}</td><td>{row.evidence?.amount??'—'}</td><td>{row.evidence?.creditBefore??'—'} / {row.evidence?.creditAfter??'—'}</td><td>{row.evidence?.decision||'—'}{row.evidence?.reason&&` · ${row.evidence.reason}`}</td></tr>)}</tbody></table></div>
      </>}
      <HubFormalRetention attemptId={attempt.id} onDisposed={receipt=>setEvidence(current=>({...current,questions:[],actions:[],stages:[],evidenceRetention:receipt}))}/>
    </>}
  </section>;
}
