import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useState} from 'react';
import {getHubTheoryQuestions,publishHubTheoryQuestion} from '../../api/client';

const emptyQuestion=()=>({code:'',expectedVersion:0,question:'',choices:[{id:'option-1',label:''},{id:'option-2',label:''}],correctOption:'option-1',source:'',rationale:'',spanish:{question:'',choices:{'option-1':'','option-2':''}},reviewedLanguages:false});
export default function HubQuestionBank({canEdit}){
  const {t} = useHubLocale();
  const [open,setOpen]=useState(false);const [questions,setQuestions]=useState([]);const [form,setForm]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const load=async()=>{
    setBusy(true);setNotice('');try{const response=await getHubTheoryQuestions();setQuestions(response.data.questions||[]);setOpen(true);}catch{setNotice(hubMessage("The private question bank could not be loaded."));}finally{setBusy(false);}
  };
  const select=id=>{
    const row=questions.find(question=>question.id===id);if(!row){setForm(null);return;}
    setForm({code:row.stable_code,expectedVersion:Math.max(...questions.filter(q=>q.stable_code===row.stable_code).map(q=>q.version)),question:row.question,choices:row.choices.map(choice=>({...choice})),correctOption:row.correct_option,source:row.source,rationale:'',spanish:{question:row.display_es?.question||'',choices:Object.fromEntries(row.choices.map(choice=>[choice.id,Object.hasOwn(row.display_es?.choices||{},choice.id)?row.display_es.choices[choice.id]:'']))},reviewedLanguages:false});
  };
  const change=key=>event=>setForm(current=>({...current,[key]:event.target.value,...(key==='rationale'?{}:{reviewedLanguages:false}),...(key==='question'?{spanish:{...current.spanish,question:''}}:{})}));
  const changeChoice=(id,value)=>setForm(current=>({...current,reviewedLanguages:false,choices:current.choices.map(choice=>choice.id===id?{...choice,label:value}:choice),spanish:{...current.spanish,choices:{...current.spanish.choices,[id]:''}}}));
  const removeChoice=id=>setForm(current=>{const choices=current.choices.filter(choice=>choice.id!==id);return {...current,choices,reviewedLanguages:false,correctOption:current.correctOption===id?choices[0].id:current.correctOption,spanish:{...current.spanish,choices:Object.fromEntries(Object.entries(current.spanish.choices).filter(([key])=>key!==id))}};});
  const addChoice=()=>{const id=crypto.randomUUID();setForm(current=>({...current,reviewedLanguages:false,choices:[...current.choices,{id,label:''}],spanish:{...current.spanish,choices:{...current.spanish.choices,[id]:''}}}));};
  const publish=async event=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{const response=await publishHubTheoryQuestion(form);setQuestions(current=>[response.data.question,...current]);setForm(null);setNotice(hubMessage("Question {0} version {1} published. Opened assessments keep their captured question.", [response.data.question.stable_code, response.data.question.version]));}
    catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("The question could not be published."), hubMessage("The question could not be published.")));}finally{setBusy(false);}
  };
  return <section className="hub-workspace-panel" aria-labelledby="hub-question-bank-title"><h3 id="hub-question-bank-title">{t("Private assessment question bank")}</h3>
    <p>{t("Question changes create a new version. Correct answers are available to TRAINER and RRHH only.")}</p>
    <button type="button" disabled={busy} onClick={load}>{open?t("Reload question bank"):t("Open question bank")}</button>
    {open&&<><label>{t("Question version")}<select defaultValue="" onChange={event=>select(event.target.value)}><option value="">{t("Select a question version")}</option>{questions.map(question=><option key={question.id} value={question.id}>{question.stable_code}{t(" · v")}{question.version}</option>)}</select></label>
      {canEdit&&<button type="button" disabled={busy} onClick={()=>setForm(emptyQuestion())}>{t("New question")}</button>}
    </>}
    {form&&<p>{t('Question versions store English and Spanish together. Editing source text requires a fresh translation review.')}</p>}
    {form&&<form onSubmit={publish}><fieldset disabled={busy||!canEdit}><legend>{form.expectedVersion?t("Publish a replacement question"):t("Publish a new question")}</legend>
      <label>{t("Question code")}<input required pattern="[a-z][a-z0-9-]{2,99}" disabled={form.expectedVersion>0} value={form.code} onChange={change('code')}/></label>
      <label>{t('English question text')}<textarea lang="en" required minLength={5} maxLength={3000} value={form.question} onChange={change('question')}/></label>
      <label>{t('Spanish question text')}<textarea lang="es" required minLength={5} maxLength={3000} value={form.spanish.question} onChange={event=>setForm(current=>({...current,reviewedLanguages:false,spanish:{...current.spanish,question:event.target.value}}))}/></label>
      <fieldset><legend>{t("Answer choices and correct answer")}</legend>{form.choices.map((choice,index)=><div key={choice.id}>
        <label><input required type="radio" name="question-correct-answer" checked={form.correctOption===choice.id} onChange={()=>setForm(current=>({...current,reviewedLanguages:false,correctOption:choice.id}))}/>{t("Correct choice ")}{index+1}</label>
        <label>{t('English choice {0}',[index+1])}<input lang="en" required maxLength={1000} value={choice.label} onChange={event=>changeChoice(choice.id,event.target.value)}/></label>
        <label>{t('Spanish choice {0}',[index+1])}<input lang="es" required maxLength={1000} value={Object.hasOwn(form.spanish.choices,choice.id)?form.spanish.choices[choice.id]:''} onChange={event=>setForm(current=>({...current,reviewedLanguages:false,spanish:{...current.spanish,choices:{...current.spanish.choices,[choice.id]:event.target.value}}}))}/></label>
        {form.choices.length>2&&<button type="button" onClick={()=>removeChoice(choice.id)}>{t("Remove choice ")}{index+1}</button>}
      </div>)}{form.choices.length<8&&<button type="button" onClick={addChoice}>{t("Add choice")}</button>}</fieldset>
      <label>{t("Authoritative source")}<textarea required minLength={5} maxLength={2000} value={form.source} onChange={change('source')}/></label>
      <label>{t("Question change reason")}<textarea required minLength={5} maxLength={2000} value={form.rationale} onChange={change('rationale')}/></label>
      {canEdit&&<><label><input type="checkbox" required checked={form.reviewedLanguages} onChange={event=>setForm(current=>({...current,reviewedLanguages:event.target.checked}))}/>{t('I reviewed both language versions against the authoritative source.')}</label><button type="submit">{t("Publish question version")}</button></>}
    </fieldset></form>}
    {notice&&<p role="status">{t(notice)}</p>}
  </section>;
}
