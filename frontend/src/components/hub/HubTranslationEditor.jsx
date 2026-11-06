import {useId,useState} from 'react';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {instructionTexts} from '../../i18n/hubContent';
import {hubMessage,hubServerMessage} from '../../i18n/hubLocale';
import {createHubInstructionTranslation} from '../../api/client';

export default function HubTranslationEditor({activityId,versions,onSaved}){
 const {t}=useHubLocale();const prefix=useId();
 const [open,setOpen]=useState(false);const [sourceId,setSourceId]=useState('');const [values,setValues]=useState({});
 const [rationale,setRationale]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const sources=versions.filter(version=>version.locale==='en'&&version.content?.instruction&&version.status!=='rejected');
 const source=sources.find(version=>version.id===sourceId);const texts=source?instructionTexts(source.content):[];
 function choose(id){
  setSourceId(id);setRationale('');setNotice('');
  const previous=versions.find(version=>version.locale==='es'&&version.content?.displayTranslation?.sourceVersionId===id);
  setValues(previous?.content.displayTranslation.es||{});
 }
 async function save(event){
  event.preventDefault();setBusy(true);setNotice('');
  try{await createHubInstructionTranslation(activityId,{sourceVersionId:sourceId,translations:Object.fromEntries(texts.map(text=>[text,Object.hasOwn(values,text)?values[text]:''])),rationale});await onSaved();setNotice(hubMessage('Spanish draft created. Submit it for independent review before publishing the English version.'));setRationale('');}
  catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message,hubMessage('The translation draft could not be saved. Keep your entries and retry.')));}finally{setBusy(false);}
 }
 return <section className="hub-translation-editor" aria-label={t('Spanish instruction translation')}>
  <h3>{t('Spanish instruction translation')}</h3><p>{t('Choose an English source version and translate its text. IDs, scoring and operational rules are not editable here.')}</p>
  <button type="button" disabled={busy} onClick={()=>{setOpen(current=>!current);if(!sourceId&&sources[0])choose(sources[0].id);}}>{t(open?'Hide translation editor':'Open translation editor')}</button>
  {notice&&<p role="status">{t(notice)}</p>}
  {open&&!sources.length&&<p>{t('Create an English instruction draft first.')}</p>}
  {open&&sources.length>0&&<form className="hub-workspace-form" onSubmit={save}><fieldset disabled={busy}>
   <label htmlFor={`${prefix}-source`}>{t('English source version')}</label><select id={`${prefix}-source`} required value={sourceId} onChange={event=>choose(event.target.value)}><option value="">{t('Choose an English source version')}</option>{sources.map(version=><option key={version.id} value={version.id}>{t('English source v{0}',[version.version_number])} · {t(version.status)}</option>)}</select>
   {source&&texts.map((text,index)=><div className="hub-translation-entry" key={text}><p id={`${prefix}-english-${index}`} lang="en">{text}</p><label htmlFor={`${prefix}-spanish-${index}`}>{t('Spanish translation {0}',[index+1])}</label><textarea id={`${prefix}-spanish-${index}`} lang="es" aria-describedby={`${prefix}-english-${index}`} required maxLength={12000} rows={2} value={Object.hasOwn(values,text)?values[text]:''} onChange={event=>setValues(current=>({...current,[text]:event.target.value}))}/></div>)}
   <label htmlFor={`${prefix}-reason`}>{t('Translation change reason')}</label><input id={`${prefix}-reason`} required minLength={5} maxLength={2000} value={rationale} onChange={event=>setRationale(event.target.value)}/>
   <button type="submit" disabled={!source}>{t('Create Spanish translation draft')}</button>
  </fieldset></form>}
 </section>;
}
