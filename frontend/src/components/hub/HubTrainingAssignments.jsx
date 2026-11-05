import {useRef,useState} from 'react';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {hubMessage,hubServerMessage} from '../../i18n/hubLocale';
import {getHubTrainingAssignments,commandHubTrainingAssignment} from '../../api/client';
import {courseKey,moduleHref} from './hubLearningModel';

const blank=()=>({moduleId:'',purpose:'reinforcement',reason:'',dueOn:''});
const statuses={assigned:'Assigned',acknowledged:'Review acknowledged',verified:'Verified',cancelled:'Cancelled'};
export default function HubTrainingAssignments({learnerId,canEdit=false,mine=false,paths=[],attempts=[]}) {
  const {t,formatDate}=useHubLocale();
  const [rows,setRows]=useState([]);const [modules,setModules]=useState([]);const [loaded,setLoaded]=useState(false);
  const [cursor,setCursor]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [form,setForm]=useState(blank);const [actions,setActions]=useState({});const retry=useRef(new Map());
  const fail=error=>setNotice(hubServerMessage(error?.response?.data?.error?.message,hubMessage('Training assignments could not be loaded or saved. Retry.')));
  async function read(after=null){
    const data=(await getHubTrainingAssignments({learnerId:mine?undefined:learnerId,cursor:after||undefined})).data;
    setRows(previous=>after?[...previous,...(data.assignments||[]).filter(row=>!previous.some(old=>old.id===row.id))]:(data.assignments||[]));
    setModules(data.moduleOptions||[]);setCursor(data.nextCursor);setLoaded(true);
  }
  async function open(){setBusy(true);setNotice('');try{await read();}catch(error){fail(error);}finally{setBusy(false);}}
  async function command(id,kind,body){
    const key=`${id||'new'}:${kind}`;if(!retry.current.has(key))retry.current.set(key,crypto.randomUUID());
    setBusy(true);setNotice('');
    try{await commandHubTrainingAssignment(id,kind,{...body,idempotencyKey:retry.current.get(key)});await read();retry.current.delete(key);if(kind==='assign')setForm(blank());setNotice(hubMessage('Training assignment saved. Earlier learning and results were preserved.'));}
    catch(error){fail(error);}finally{setBusy(false);}
  }
  function update(field,value){retry.current.delete('new:assign');setForm(current=>({...current,[field]:value}));}
  function updateAction(id,field,value){retry.current.delete(`${id}:verify`);retry.current.delete(`${id}:cancel`);setActions(current=>({...current,[id]:{...current[id],[field]:value}}));}
  return <section className="hub-workspace-panel hub-training-assignments" aria-label={t('Targeted training assignments')}>
    <h2>{t(mine?'My targeted training':'Targeted training assignments')}</h2>
    <p>{t('Assignments guide onboarding or reinforcement. A review acknowledgment is not a competency result and does not reset previous progress.')}</p>
    <button type="button" disabled={busy} onClick={open}>{t(loaded?'Refresh assignments':'Open targeted training')}</button>
    {notice&&<p role="status">{t(notice)}</p>}
    {loaded&&canEdit&&<form className="hub-workspace-form" onSubmit={event=>{event.preventDefault();command(null,'assign',{...form,dueOn:form.dueOn||null,learnerId,expectedRevision:0});}}><fieldset disabled={busy}>
      <legend>{t('Assign focused training')}</legend>
      <p>{t('Reviewing a completed lesson does not reopen its exercise. Use mixed practice for another practical run, or a trainer-authorized formal reassessment.')}</p>
      <label>{t('Assigned module')}<select required value={form.moduleId} onChange={event=>update('moduleId',event.target.value)}><option value="">{t('Choose a module')}</option>{modules.map(module=><option key={module.id} value={module.id}>{t(module.courseTitle)} / {t(module.title)}</option>)}</select></label>
      {modules.length===200&&<p>{t('Showing up to 200 assigned modules. Contact administration if the required module is missing.')}</p>}
      {!modules.length&&<p>{t('Assign a course to this learner before creating a targeted assignment.')}</p>}
      <label>{t('Training purpose')}<select value={form.purpose} onChange={event=>update('purpose',event.target.value)}><option value="reinforcement">{t('Reinforcement')}</option><option value="onboarding">{t('Onboarding')}</option></select></label>
      <label>{t('Reason visible to the learner (omit private credentials)')}<textarea required minLength={5} maxLength={1000} rows={3} value={form.reason} onChange={event=>update('reason',event.target.value)}/></label>
      <label>{t('Target date (optional)')}<input type="date" min="2000-01-01" max="2100-12-31" value={form.dueOn} onChange={event=>update('dueOn',event.target.value)}/></label>
      <button type="submit" disabled={!modules.length}>{t('Create training assignment')}</button>
    </fieldset></form>}
    {loaded&&!rows.length&&<p className="hub-empty-state">{t('No targeted training assignments.')}</p>}
    <div className="hub-assignment-list">{rows.map(row=>{
      const path=paths.find(path=>courseKey(path)===row.courseId);const module=path?.modules.find(module=>module.id===row.module_id);
      const eligible=attempts.filter(attempt=>attempt.module_id===row.module_id&&attempt.status==='completed'&&Date.parse(attempt.completed_at)>Date.parse(row.created_at));
      const action=actions[row.id]||{};const active=!['verified','cancelled'].includes(row.status);
      return <article key={row.id} className="hub-home-card"><p className="hub-meta-label">{t(row.purpose==='reinforcement'?'Reinforcement':'Onboarding')} · {t(statuses[row.status]||row.status)}</p><h3>{t(row.moduleTitle)}</h3><p>{row.reason}</p>
        {row.due_on&&<p>{t('Target date')}: {formatDate(`${row.due_on}T12:00:00Z`,{dateStyle:'medium',timeZone:'America/Lima'})}</p>}
        <p><small>{t('Assigned at {0}',[formatDate(row.created_at)])}</small></p>
        {mine&&module&&<p><a href={moduleHref(path,module)}>{t('View module')}</a></p>}
        {mine&&!module&&<p>{t('This module is not in your current assigned courses. Contact your Capacitador.')}</p>}
        {mine&&row.status==='assigned'&&<button type="button" disabled={busy} onClick={()=>command(row.id,'acknowledge',{expectedRevision:row.revision})}>{t('Confirm I reviewed this assignment')}</button>}
        {row.status==='acknowledged'&&<p>{t('Review recorded. Competency has not been verified by this acknowledgment.')}</p>}
        {row.verification_attempt_id&&<p>{t('Verification evidence')}: {row.verification_attempt_id}</p>}
        {canEdit&&active&&<form className="hub-workspace-form" onSubmit={event=>{event.preventDefault();const kind=event.nativeEvent.submitter?.value;if(kind)command(row.id,kind,{expectedRevision:row.revision,reason:action.reason||'',verificationAttemptId:action.attemptId||null});}}><fieldset disabled={busy}>
          <label>{t('Review reason (omit private credentials)')}<input required minLength={5} maxLength={1000} value={action.reason||''} onChange={event=>updateAction(row.id,'reason',event.target.value)}/></label>
          <label>{t('Later completed module evidence')}<select value={action.attemptId||''} onChange={event=>updateAction(row.id,'attemptId',event.target.value)}><option value="">{t('Choose verification evidence')}</option>{eligible.map(attempt=><option key={attempt.id} value={attempt.id}>{attempt.id.slice(0,8)} · {formatDate(attempt.completed_at)}</option>)}</select></label>
          {!eligible.length&&<p>{t('Verification needs a later completed attempt for this exact learner and module. Earlier results remain unchanged.')}</p>}
          <button type="submit" value="verify" disabled={!action.attemptId}>{t('Verify with later evidence')}</button><button type="submit" value="cancel">{t('Cancel training assignment')}</button>
        </fieldset></form>}
      </article>;
    })}</div>
    {cursor&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await read(cursor);}catch(error){fail(error);}finally{setBusy(false);}}}>{t('Load more assignments')}</button>}
  </section>;
}
