import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {questionStemText,questionChoiceText} from '../../i18n/hubContent';
import {useEffect,useRef,useState} from 'react';
import {commandHubEvaluation} from '../../api/client';

const labels={CREATE_ACCOUNT:'Create Account',SEARCH_USER:'Search User',VERIFY_BALANCE:'Verify Balance',ADD_CREDITS:'Add Credits',WITHDRAW_CREDITS:'Withdraw Credits',REVIEW_TRANSACTION_RECORDS:'Review Transaction Records',RESET_PASSWORD_EDIT_INFORMATION:'Reset Password / Edit Information'};

export function HubPracticeActionForm({task,busy,execute,history}){
  const {locale,t} = useHubLocale();
  const [form,setForm]=useState({identifier:'',password:'',credit:'',amount:'',kiosk:'',decision:'',reason:'',responseCode:'',reference:''});const [rows,setRows]=useState([]);const [selected,setSelected]=useState([]);
  const update=key=>event=>setForm(current=>({...current,[key]:event.target.value}));
  const password=['CREATE_ACCOUNT','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_CREATE_ACCOUNT','BACKEND_RESET_PASSWORD'].includes(task.action);
  const reconciliation=task.action==='RESOLVE_RECONCILIATION';const customer=task.action==='CUSTOMER_RESPONSE';
  const backend=task.action.startsWith('BACKEND_')||reconciliation;const backendMovement=['BACKEND_ADD_CREDITS','BACKEND_WITHDRAW_CREDITS','RESOLVE_RECONCILIATION'].includes(task.action);
  const movement=['ADD_CREDITS','WITHDRAW_CREDITS'].includes(task.action);
  const review=task.action==='REVIEW_TRANSACTION_RECORDS';
  const balance=['VERIFY_BALANCE','BACKEND_REFRESH_BALANCE'].includes(task.action);
  return <form onSubmit={event=>{event.preventDefault();const input={actionCode:task.action,identifier:form.identifier};if(password)input.password=form.password;if(movement)input.amount=form.amount;if(balance||customer)input.credit=form.credit;if(review)input.historyIds=selected;if(backend)Object.assign(input,{kiosk:form.kiosk,decision:form.decision,reason:form.reason});if(customer)Object.assign(input,{responseCode:form.responseCode,reference:form.reference});execute('action',input);}}>
    <fieldset disabled={busy}><legend>{t(labels[task.action]||task.action.replaceAll('_',' '))}</legend>
      {task.operationNumber&&<p>{t("Shift operation ")}{task.operationNumber}{t(" · stage ")}{task.stage}{t(" of 2")}</p>}
      <dl><div><dt>{t("Game")}</dt><dd>{task.game}</dd></div><div><dt>{t("Customer")}</dt><dd>{task.customerUsername}</dd></div>{task.identifier&&<div><dt>{t("Player")}</dt><dd>{task.identifier}</dd></div>}<div><dt>{t("Credit / available balance")}</dt><dd>{task.credit} / {task.availableBalance}</dd></div>{movement&&<div><dt>{t("Requested credits")}</dt><dd>{task.amount}</dd></div>}</dl>
      {task.operation&&(backend||customer)&&<p>{t("Backend ")}{t(task.operation.type)}: {task.operation.amount} · {t(task.operation.status)}{t(" · Reference ")}{task.operation.id}</p>}
      {customer&&<p>{t("Recorded customer balance: ")}{task.customerBalance}</p>}
      {!backendMovement&&!customer&&<label>{t("Game ID")}<input value={form.identifier} onChange={update('identifier')} maxLength={200}/></label>}
      {password&&<label>{t("Game password")}<input type="password" autoComplete="off" value={form.password} onChange={update('password')} maxLength={200}/></label>}
      {movement&&<label>{t("Credits")}<input type="number" step="any" value={form.amount} onChange={update('amount')}/></label>}
      {balance&&<label>{t("Observed game credit")}<input type="number" step="any" value={form.credit} onChange={update('credit')}/></label>}
      {backend&&!backendMovement&&<label>{t("Kiosk")}<input value={form.kiosk} onChange={update('kiosk')} maxLength={200}/></label>}
      {backend&&<><label>{t("Backend decision")}<select required value={form.decision} onChange={update('decision')}><option value="">{t("Select a decision")}</option><option value="APPROVED">{t("Approve")}</option><option value="CANCELLED">{t("Cancel")}</option></select></label><label>{t("Decision reason")}<input value={form.reason} onChange={update('reason')} maxLength={200}/></label></>}
      {customer&&<><label>{t("Response approach")}<select required value={form.responseCode} onChange={update('responseCode')}><option value="">{t("Select an approach")}</option><option value="recorded-outcome">{t("Explain the recorded outcome, reference and balance using verified evidence")}</option><option value="promise-success">{t("Promise success before checking the recorded outcome")}</option><option value="repeat-movement">{t("Repeat the game movement to resolve uncertainty")}</option></select></label><label>{t("Customer balance in response")}<input type="number" step="any" value={form.credit} onChange={update('credit')}/></label><label>{t("Operation reference in response")}<input value={form.reference} onChange={update('reference')}/></label></>}
      {(review||reconciliation)&&<><button type="button" onClick={async()=>{const result=await history();if(result)setRows(result.history||[]);}}>{t("Game history")}</button><div className="hub-account-table-wrap" role="region" aria-label={t("Account transaction records")} tabIndex={0}><table><caption>{t("Account transaction records")}</caption><thead><tr>{review&&<th>{t("Reviewed")}</th>}<th>{t("Action")}</th><th>{t("Credits")}</th><th>{t("Time")}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>{review&&<td><input type="checkbox" aria-label={t("Reviewed record {0}", [row.id])} checked={selected.includes(row.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,row.id]:current.filter(id=>id!==row.id))}/></td>}<td>{t(row.type)}</td><td>{row.amount}</td><td>{new Date(row.createdAt).toLocaleString(locale==='es'?'es-PE':'en-US')}</td></tr>)}</tbody></table></div></>}
      <button type="submit">{t("Record action")}</button>
    </fieldset>
  </form>;
}

export default function HubEvaluationRuntime({attemptId,onReturn}){
  const {locale,t,contentTranslationIssues} = useHubLocale();
  const [view,setView]=useState(null);const [answers,setAnswers]=useState({});const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [now,setNow]=useState(()=>Date.now());
  const pending=useRef(null);const startKey=useRef(crypto.randomUUID());
  const heading=useRef(null);const errorNotice=useRef(null);const returnButton=useRef(null);
  useEffect(()=>{
    let active=true;
    commandHubEvaluation(attemptId,'start',{idempotencyKey:startKey.current}).then(response=>{if(active)setView(response.data);}).catch(error=>{if(active)setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("The assessment could not be opened."), hubMessage("The assessment could not be opened.")));});
    return()=>{active=false;};
  },[attemptId]);
  useEffect(()=>{
    if(view?.status!=='in_progress')return undefined;
    const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);
  },[view?.status]);
  const remaining=view?.expiresAt?Math.max(0,Math.ceil((new Date(view.expiresAt).getTime()-now)/1000)):null;
  const expired=remaining===0;
  const timeNotice=view?.status!=='in_progress'?'':expired?'Time has expired. Return to checkpoint results.':remaining<=60?'One minute or less remains in this assessment.':remaining<=300?'Five minutes or less remain in this assessment.':'';
  useEffect(()=>{if(view?.status)heading.current?.focus();},[view?.status,view?.completedActions,view?.theorySubmitted]); // State transitions replace the focused form; history reads do not.
  useEffect(()=>{if(notice)errorNotice.current?.focus();},[notice]);
  useEffect(()=>{if(expired&&view?.status==='in_progress')returnButton.current?.focus();},[expired,view?.status]);
  const execute=async(command,input={})=>{
    const fingerprint=JSON.stringify([command,input]);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};
    setBusy(true);setNotice('');
    try{
      const response=await commandHubEvaluation(attemptId,command,{...input,idempotencyKey:pending.current.key});pending.current=null;
      if(command!=='history')setView(response.data);return response.data;
    }catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("The action could not be recorded. Retry this action."), hubMessage("The action could not be recorded. Retry this action.")));return null;}finally{setBusy(false);}
  };
  return <section className="hub-workspace-panel" aria-labelledby="hub-formal-runtime-title">
    <h2 id="hub-formal-runtime-title" ref={heading} tabIndex={-1}>{t("Formal assessment")}</h2>
    {notice&&<p role="alert" ref={errorNotice} tabIndex={-1}>{t(notice)}</p>}
    {locale==='es'&&contentTranslationIssues?.runtime&&<button type="button" disabled={busy} onClick={()=>execute('read')}>{t('Refresh content translations')}</button>}
    <p role="status" aria-live="polite" aria-atomic="true" id="hub-assessment-time-notice">{t(timeNotice)}</p>
    {!view&&!notice&&<p role="status">{t("Opening assigned assessment…")}</p>}
    {view?.status==='in_progress'&&<>
      <p>{t("Deadline: ")}{new Date(view.expiresAt).toLocaleString(locale==='es'?'es-PE':'en-US')}{t(". Your numerical result appears when both sections are recorded.")}</p>
      <p role="timer" aria-live="off" aria-label={t("Assessment time remaining")}>{expired?t("Time remaining: 0:00"):t("Time remaining: {0}:{1}", [Math.floor(remaining/60), String(remaining%60).padStart(2,'0')])}</p>
      {!view.theorySubmitted&&<form onSubmit={event=>{event.preventDefault();execute('theory',{answers});}}><fieldset disabled={busy||expired}><legend>{t("Theory")}</legend>
        {view.questions.map(question=><fieldset key={question.code}><legend>{questionStemText(locale,question,t)}</legend>{question.choices.map(choice=><label key={choice.id}><input required type="radio" name={question.code} value={choice.id} checked={answers[question.code]===choice.id} onChange={()=>setAnswers(current=>({...current,[question.code]:choice.id}))}/>{questionChoiceText(locale,question,choice,t)}</label>)}</fieldset>)}
        <button type="submit">{t("Record theory responses")}</button>
      </fieldset></form>}
      {view.theorySubmitted&&<p>{t("Theory responses recorded.")}</p>}
      <p>{t("Practical actions recorded: ")}{view.completedActions} / {view.totalActions}</p>
      {view.task&&<HubPracticeActionForm key={`${attemptId}:${view.completedActions}`} task={view.task} busy={busy||expired} execute={execute} history={()=>execute('history')}/>}
      {!view.task&&<p>{t("Practical actions recorded. Complete any remaining theory responses.")}</p>}
    </>}
    {view&&view.status!=='in_progress'&&<p role="status">{t("Result: ")}{view.score}% · {view.result==='successful'?t("Successful"):t("Unsuccessful")} · {view.status==='submitted'?t("Submitted"):t("Awaiting result submission")}</p>}
    <button type="button" ref={returnButton} aria-describedby={expired?'hub-assessment-time-notice':undefined} disabled={busy} onClick={onReturn}>{t("Return to checkpoint results")}</button>
  </section>;
}
