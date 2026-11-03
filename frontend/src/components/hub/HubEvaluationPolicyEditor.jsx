import {useState} from 'react';
import {publishHubEvaluationPolicy} from '../../api/client';

export default function HubEvaluationPolicyEditor({evaluation,onPublished}){
  const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [form,setForm]=useState(null);
  const begin=()=>{
    setForm({duration_minutes:evaluation.duration_minutes,theory_weight:evaluation.theory_weight,practical_weight:evaluation.practical_weight,history_review_days:evaluation.history_review_days,history_record_limit:evaluation.history_record_limit??'',
      families:(evaluation.selected_game_family_keys||[]).join('\n'),questions:(evaluation.theory_item_codes||[]).join('\n'),weights:{...evaluation.practical_item_weights},rationale:''});
    setNotice('');setOpen(true);
  };
  const change=key=>event=>setForm(current=>({...current,[key]:event.target.value}));
  const publish=async event=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{
      const configuration={};
      for(const key of ['duration_minutes','theory_weight','practical_weight','history_review_days'])configuration[key]=Number(form[key]);
      configuration.history_record_limit=form.history_record_limit===''?null:Number(form.history_record_limit);
      configuration.selected_game_family_keys=form.families.split('\n').map(value=>value.trim()).filter(Boolean);
      configuration.theory_item_codes=form.questions.split('\n').map(value=>value.trim()).filter(Boolean);
      configuration.practical_item_weights=Object.fromEntries(Object.entries(form.weights).map(([key,value])=>[key,Number(value)]));
      const response=await publishHubEvaluationPolicy(evaluation.id,{expectedRevision:evaluation.revision,configuration,rationale:form.rationale});
      onPublished(response.data.evaluation);setOpen(false);setNotice(`Policy version ${response.data.evaluation.revision} published. Existing attempts keep their original rules.`);
    }catch(error){setNotice(error?.response?.data?.error?.message||'The new policy could not be published.');}finally{setBusy(false);}
  };
  return <div className="hub-workspace-panel">
    {!open&&<button type="button" disabled={busy} onClick={begin}>Create policy version</button>}
    {open&&<form onSubmit={publish}><fieldset disabled={busy}><legend>New policy for {evaluation.title}</legend>
      <p>Publish a complete replacement for future attempts. The required action sequence, three-attempt limit and 100% pass rule remain enforced.</p>
      {[['duration_minutes','Duration in minutes'],['theory_weight','Theory weight'],['practical_weight','Practical weight'],['history_review_days','History review days'],['history_record_limit','Recent record limit']].map(([key,label])=><label key={key}>{label}<input type="number" value={form[key]} onChange={change(key)}/></label>)}
      <label>Verified family codes, one per line<textarea value={form.families} onChange={change('families')}/></label>
      <label>Published question codes, one per line<textarea value={form.questions} onChange={change('questions')}/></label>
      <fieldset><legend>Practical action weights</legend>{(evaluation.required_action_codes||[]).map(code=><label key={code}>{code.replaceAll('_',' ')}<input type="number" min="0.01" step="0.01" required value={form.weights[code]??''} onChange={event=>setForm(current=>({...current,weights:{...current.weights,[code]:event.target.value}}))}/></label>)}</fieldset>
      <label>Publication reason<textarea required minLength={5} maxLength={2000} value={form.rationale} onChange={change('rationale')}/></label>
      <button type="submit">Publish new policy version</button><button type="button" onClick={()=>setOpen(false)}>Cancel editing</button>
    </fieldset></form>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
