import {useState} from 'react';
import {getHubTheoryQuestions,publishHubTheoryQuestion} from '../../api/client';

const emptyQuestion=()=>({code:'',expectedVersion:0,question:'',choices:[{id:'option-1',label:''},{id:'option-2',label:''}],correctOption:'option-1',source:'',rationale:''});
export default function HubQuestionBank({canEdit}){
  const [open,setOpen]=useState(false);const [questions,setQuestions]=useState([]);const [form,setForm]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const load=async()=>{
    setBusy(true);setNotice('');try{const response=await getHubTheoryQuestions();setQuestions(response.data.questions||[]);setOpen(true);}catch{setNotice('The private question bank could not be loaded.');}finally{setBusy(false);}
  };
  const select=id=>{
    const row=questions.find(question=>question.id===id);if(!row){setForm(null);return;}
    setForm({code:row.stable_code,expectedVersion:Math.max(...questions.filter(q=>q.stable_code===row.stable_code).map(q=>q.version)),question:row.question,choices:row.choices.map(choice=>({...choice})),correctOption:row.correct_option,source:row.source,rationale:''});
  };
  const change=key=>event=>setForm(current=>({...current,[key]:event.target.value}));
  const publish=async event=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{const response=await publishHubTheoryQuestion(form);setQuestions(current=>[response.data.question,...current]);setForm(null);setNotice(`Question ${response.data.question.stable_code} version ${response.data.question.version} published. Opened assessments keep their captured question.`);}
    catch(error){setNotice(error?.response?.data?.error?.message||'The question could not be published.');}finally{setBusy(false);}
  };
  return <section className="hub-workspace-panel" aria-labelledby="hub-question-bank-title"><h3 id="hub-question-bank-title">Private assessment question bank</h3>
    <p>Question changes create a new version. Correct answers are available to TRAINER and RRHH only.</p>
    <button type="button" disabled={busy} onClick={load}>{open?'Reload question bank':'Open question bank'}</button>
    {open&&<><label>Question version<select defaultValue="" onChange={event=>select(event.target.value)}><option value="">Select a question version</option>{questions.map(question=><option key={question.id} value={question.id}>{question.stable_code} · v{question.version}</option>)}</select></label>
      {canEdit&&<button type="button" disabled={busy} onClick={()=>setForm(emptyQuestion())}>New question</button>}
    </>}
    {form&&<form onSubmit={publish}><fieldset disabled={busy||!canEdit}><legend>{form.expectedVersion?'Publish a replacement question':'Publish a new question'}</legend>
      <label>Question code<input required pattern="[a-z][a-z0-9-]{2,99}" disabled={form.expectedVersion>0} value={form.code} onChange={change('code')}/></label>
      <label>Question text<textarea required minLength={5} maxLength={3000} value={form.question} onChange={change('question')}/></label>
      <fieldset><legend>Answer choices and correct answer</legend>{form.choices.map((choice,index)=><div key={choice.id}>
        <label><input required type="radio" name="question-correct-answer" checked={form.correctOption===choice.id} onChange={()=>setForm(current=>({...current,correctOption:choice.id}))}/>Correct choice {index+1}</label>
        <label>Choice {index+1} text<input required maxLength={1000} value={choice.label} onChange={event=>setForm(current=>({...current,choices:current.choices.map(item=>item.id===choice.id?{...item,label:event.target.value}:item)}))}/></label>
        {form.choices.length>2&&<button type="button" onClick={()=>setForm(current=>({...current,choices:current.choices.filter(item=>item.id!==choice.id),correctOption:current.correctOption===choice.id?current.choices.find(item=>item.id!==choice.id).id:current.correctOption}))}>Remove choice {index+1}</button>}
      </div>)}{form.choices.length<8&&<button type="button" onClick={()=>setForm(current=>({...current,choices:[...current.choices,{id:crypto.randomUUID(),label:''}]}))}>Add choice</button>}</fieldset>
      <label>Authoritative source<textarea required minLength={5} maxLength={2000} value={form.source} onChange={change('source')}/></label>
      <label>Question change reason<textarea required minLength={5} maxLength={2000} value={form.rationale} onChange={change('rationale')}/></label>
      {canEdit&&<button type="submit">Publish question version</button>}
    </fieldset></form>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
