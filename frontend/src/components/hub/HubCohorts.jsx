import {useRef,useState} from 'react';
import {getHubCohorts,getHubAssignableCourses,getHubPostulanteAccounts,saveHubCohort} from '../../api/client';

const empty=()=>({id:null,title:'',courseId:'',dueOn:'',revision:0});
const targetLabel=date=>date?new Intl.DateTimeFormat(undefined,{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)):'No target date';

export default function HubCohorts({canManage=false}) {
  const [open,setOpen]=useState(false);
  const [cohorts,setCohorts]=useState([]);
  const [courses,setCourses]=useState([]);
  const [learners,setLearners]=useState([]);
  const [form,setForm]=useState(empty);
  const [selected,setSelected]=useState([]);
  const [nextCursor,setNextCursor]=useState(null);
  const [cursor,setCursor]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const retry=useRef(null);
  async function load(after=null) {
    setBusy(true);setError('');
    try {
      const response=await getHubCohorts(after);
      if(canManage){
        const [courseResponse,learnerResponse]=await Promise.all([getHubAssignableCourses(),getHubPostulanteAccounts()]);
        setCourses(courseResponse.data.courses||[]);setLearners(learnerResponse.data.postulantes||[]);
      }
      setCohorts(response.data.cohorts||[]);setNextCursor(response.data.nextCursor);setCursor(after);setOpen(true);
    } catch(e){setError(e.response?.data?.error?.message||'Cohorts could not be loaded.');}
    finally{setBusy(false);}
  }
  async function save(event) {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const body={title:form.title,courseId:form.courseId,dueOn:form.dueOn||null,expectedRevision:form.revision,learnerIds:selected};
    const fingerprint=JSON.stringify({id:form.id,...body});
    if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};
    try {
      await saveHubCohort(form.id,{...body,idempotencyKey:retry.current.key});
      setForm(empty());setSelected([]);retry.current=null;
      await load();setNotice('Cohort saved. Existing learning progress and assessment results are preserved.');
    } catch(e){setError(e.response?.data?.error?.message||'The save could not be confirmed. Retry the same form safely.');}
    finally{setBusy(false);}
  }
  function edit(cohort){setForm(cohort);setSelected([]);setNotice('');}
  return <section className="hub-workspace-panel" aria-label={canManage?'Cohort management':'My training groups'}>
    <h2>{canManage?'Cohorts and target dates':'My training groups'}</h2>
    <p>Target dates help plan training. Practice access and assessment deadlines follow their existing rules.</p>
    <button type="button" disabled={busy} onClick={()=>load(cursor)}>{open?'Update cohorts':'Open cohorts'}</button>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {open&&<>
      {!cohorts.length&&<p>No cohorts on this page.</p>}
      <ul className="hub-version-list">{cohorts.map(cohort=><li key={cohort.id}>
        <strong>{cohort.title}</strong> · {cohort.courseTitle} · {targetLabel(cohort.dueOn)}
        {cohort.dueOn&&cohort.dueOn<new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'})&&<span> · Target date passed</span>}
        {canManage&&<><p>{cohort.members.length} / 100 learners</p><button type="button" disabled={busy} onClick={()=>edit(cohort)}>Edit {cohort.title}</button>
          <details><summary>View cohort members</summary><ul>{cohort.members.map(member=><li key={member.id}>{member.displayName} · {member.status}</li>)}</ul></details></>}
      </li>)}</ul>
      {cursor&&<button disabled={busy} onClick={()=>load()}>First cohort page</button>}
      {nextCursor&&<button disabled={busy} onClick={()=>load(nextCursor)}>Next cohort page</button>}
      {canManage&&<form className="hub-workspace-form" onSubmit={save}>
        <h3>{form.id?'Edit cohort and add learners':'Create cohort'}</h3>
        <label>Cohort name<input required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label>Cohort course<select required disabled={Boolean(form.id)} value={form.courseId} onChange={e=>setForm({...form,courseId:e.target.value})}>
          <option value="">Choose a course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}
        </select></label>
        <label>Target date<input type="date" min="2000-01-01" max="2100-12-31" value={form.dueOn||''} onChange={e=>setForm({...form,dueOn:e.target.value})}/></label>
        <fieldset disabled={busy}><legend>{form.id?'Add learners (existing members remain)':'Select learners (at most 100)'}</legend>
          {learners.filter(learner=>learner.status!=='inactive').map(learner=><label key={learner.id}>
            <input type="checkbox" checked={selected.includes(learner.id)} onChange={e=>setSelected(e.target.checked?[...selected,learner.id]:selected.filter(id=>id!==learner.id))}/>{learner.displayName||learner.username}
          </label>)}
        </fieldset>
        <button type="submit" disabled={busy||selected.length>100||(!form.id&&!selected.length)}>Save cohort</button>
        {form.id&&<button type="button" disabled={busy} onClick={()=>{setForm(empty());setSelected([]);}}>Cancel cohort edit</button>}
      </form>}
    </>}
  </section>;
}
