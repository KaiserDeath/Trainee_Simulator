import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useRef, useState } from 'react';
import { getHubWorkspaceCatalog,getHubInstructionVersions,createHubInstruction,submitHubContentVersion,reviewHubContentVersion,getHubMediaLibrary } from '../../api/client';
import HubMediaItem from './HubMediaItem';

const fields = ['summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','mediaAssetIds'];
const message = error => error?.response?.data?.error?.message || 'Content could not be loaded or saved. Please retry.';

export default function HubContentStudio({ canEdit }) {
  const {t} = useHubLocale();

  const [catalog,setCatalog]=useState(null);
  const [selected,setSelected]=useState(null);
  const [versions,setVersions]=useState([]);
  const [form,setForm]=useState({title:'',summary:'',paragraphs:'',keyPoints:'',items:'',rationale:'',mediaAssetIds:[]});
  const [mediaAssets,setMediaAssets]=useState(null);
  const [reviewReason,setReviewReason]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const selection=useRef(0);
  const load=async()=>{
    setBusy(true);setNotice('');
    try { setCatalog((await getHubWorkspaceCatalog()).data); }
    catch(error){setNotice(hubServerMessage(message(error)));}
    finally{setBusy(false);}
  };
  const choose=async(id)=>{
    const request=++selection.current;
    const activity=catalog.activities.find(row=>row.id===id);
    setSelected(activity||null);setVersions([]);setNotice('');setReviewReason('');setMediaAssets(null);
    if(!activity)return;
    setForm({title:activity.title,summary:activity.content?.summary||'',paragraphs:(activity.content?.paragraphs||[]).join('\n\n'),keyPoints:(activity.content?.keyPoints||[]).join('\n'),items:(activity.content?.items||[]).map(item=>typeof item==='string'?item:item.label).join('\n'),rationale:'',mediaAssetIds:activity.content?.mediaAssetIds||[]});
    if(canEdit){
      setBusy(true);
      try {const response=await getHubInstructionVersions(id);if(request===selection.current)setVersions(response.data.versions.sort((a,b)=>b.version_number-a.version_number));}
      catch(error){if(request===selection.current)setNotice(hubServerMessage(message(error)));}
      finally{if(request===selection.current)setBusy(false);}
    }
  };
  const refreshVersions=async()=>setVersions((await getHubInstructionVersions(selected.id)).data.versions.sort((a,b)=>b.version_number-a.version_number));
  const save=async(event)=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{
      const instruction=Object.fromEntries(Object.entries(selected.content||{}).filter(([key])=>fields.includes(key)));
      Object.assign(instruction,{summary:form.summary,paragraphs:form.paragraphs.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean),keyPoints:form.keyPoints.split('\n').map(x=>x.trim()).filter(Boolean),mediaAssetIds:form.mediaAssetIds});
      if(selected.activity_type==='checklist')instruction.items=form.items.split('\n').map(x=>x.trim()).filter(Boolean).map((label,index)=>({id:`item-${index}`,label}));
      await createHubInstruction(selected.id,{title:form.title,instruction,changeRationale:form.rationale});
      await refreshVersions();setNotice(hubMessage("Draft created. Submit it for review."));
    }catch(error){setNotice(hubServerMessage(message(error)));}finally{setBusy(false);}
  };
  const transition=async(version,decision)=>{
    setBusy(true);setNotice('');
    try{
      if(decision==='submit')await submitHubContentVersion(version.id);
      else await reviewHubContentVersion(version.id,{decision,rationale:reviewReason});
      await refreshVersions();setNotice(hubMessage("Publication state updated."));
      if(decision==='approve')setCatalog((await getHubWorkspaceCatalog()).data);
    }catch(error){setNotice(hubServerMessage(message(error)));}finally{setBusy(false);}
  };
  const update=key=>event=>setForm(current=>({...current,[key]:event.target.value}));
  const loadMedia=async()=>{const request=selection.current;setBusy(true);try{const response=await getHubMediaLibrary();if(request===selection.current)setMediaAssets(response.data.assets.filter(asset=>asset.status==='published'));}catch(error){setNotice(hubServerMessage(message(error)));}finally{if(request===selection.current)setBusy(false);}};
  return <section className="hub-workspace-panel">
    <h2>{t("Content studio")}</h2>
    <p>{t("Edit instructions without changing operational rules. A different administrator must approve publication. Existing attempts retain their original lesson.")}</p>
    <button type="button" disabled={busy} onClick={load}>{catalog?(t("Refresh catalog")):(t("Open content catalog"))}</button>
    {notice&&<p role="status">{t(notice)}</p>}
    {catalog&&<label>{t("Activity")}<select value={selected?.id||''} disabled={busy} onChange={event=>choose(event.target.value)}>
      <option value="">{t("Choose an activity")}</option>
      {[...catalog.activities].sort((a,b)=>a.title.localeCompare(b.title)).map(row=><option key={row.id} value={row.id}>{t(catalog.modules.find(module=>module.id===row.module_id)?.title)} / {t(row.title)}</option>)}
    </select></label>}
    {selected&&<p>{t('The editable source is in English. Display translations are versioned separately.')}</p>}
    {selected&&<form onSubmit={save} className="hub-workspace-form">
      <fieldset disabled={busy||!canEdit}>
        <label>{t("Lesson title")}<input value={form.title} onChange={update('title')} maxLength={200} required/></label>
        <label>{t("Summary")}<textarea value={form.summary} onChange={update('summary')} maxLength={12000}/></label>
        <label>{t("Lesson text (blank line between paragraphs)")}<textarea rows={7} value={form.paragraphs} onChange={update('paragraphs')}/></label>
        <label>{t("Key points (one per line)")}<textarea rows={4} value={form.keyPoints} onChange={update('keyPoints')}/></label>
        {canEdit&&<><button type="button" onClick={loadMedia}>{t("Choose published training assets")}</button><p>{form.mediaAssetIds.length}{t(" training assets attached.")}</p>
          {mediaAssets?.map(asset=><label key={asset.id}><input type="checkbox" checked={form.mediaAssetIds.includes(asset.id)} onChange={event=>setForm(current=>({...current,mediaAssetIds:event.target.checked?[...current.mediaAssetIds,asset.id]:current.mediaAssetIds.filter(id=>id!==asset.id)}))}/>{asset.title}{t(" · v")}{asset.version}</label>)}
          {form.mediaAssetIds.length>0&&<button type="button" onClick={()=>setForm(current=>({...current,mediaAssetIds:[]}))}>{t("Remove all attached assets")}</button>}</>}
        {selected.activity_type==='checklist'&&<label>{t("Checklist (one item per line)")}<textarea value={form.items} onChange={update('items')}/></label>}
        {canEdit&&<><label>{t("Reason for change")}<input required value={form.rationale} onChange={update('rationale')} maxLength={2000}/></label><button type="submit">{t("Create new draft")}</button></>}
      </fieldset>
      {!canEdit&&<p>{t("Read-only preview. ADMIN manages content versions and publication.")}</p>}
    </form>}
    {canEdit&&selected&&<div>
      <label>{t("Review rationale")}<input value={reviewReason} onChange={event=>setReviewReason(event.target.value)} maxLength={2000}/></label>
      <ul className="hub-version-list">{versions.map(version=><li key={version.id}>
        <strong>{t("v")}{version.version_number} · {t(version.status)}</strong><p>{version.change_rationale}</p>
        <details><summary>{t("Preview version")}</summary><p>{t(version.content.title)}</p><p>{version.content.instruction?.summary}</p>{(version.content.instruction?.paragraphs||[]).map((p,i)=><p key={i}>{p}</p>)}{(version.content.instruction?.mediaAssetIds||[]).map(id=><HubMediaItem key={id} assetId={id}/>)}</details>
        {version.status==='draft'&&<button type="button" disabled={busy} onClick={()=>transition(version,'submit')}>{t("Submit for review")}</button>}
        {version.status==='pending_review'&&<><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>transition(version,'approve')}>{t("Approve publication")}</button><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>transition(version,'reject')}>{t("Reject")}</button></>}
      </li>)}</ul>
    </div>}
  </section>;
}
