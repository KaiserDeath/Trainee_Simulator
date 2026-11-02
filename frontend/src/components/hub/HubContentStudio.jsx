import { useRef, useState } from 'react';
import { getHubWorkspaceCatalog,getHubInstructionVersions,createHubInstruction,submitHubContentVersion,reviewHubContentVersion } from '../../api/client';

const fields = ['summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement'];
const message = error => error?.response?.data?.error?.message || 'Content could not be loaded or saved. Please retry.';

export default function HubContentStudio({ canEdit,locale='en' }) {
  const es=locale==='es';
  const [catalog,setCatalog]=useState(null);
  const [selected,setSelected]=useState(null);
  const [versions,setVersions]=useState([]);
  const [form,setForm]=useState({title:'',summary:'',paragraphs:'',keyPoints:'',items:'',rationale:''});
  const [reviewReason,setReviewReason]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const selection=useRef(0);
  const load=async()=>{
    setBusy(true);setNotice('');
    try { setCatalog((await getHubWorkspaceCatalog()).data); }
    catch(error){setNotice(message(error));}
    finally{setBusy(false);}
  };
  const choose=async(id)=>{
    const request=++selection.current;
    const activity=catalog.activities.find(row=>row.id===id);
    setSelected(activity||null);setVersions([]);setNotice('');setReviewReason('');
    if(!activity)return;
    setForm({title:activity.title,summary:activity.content?.summary||'',paragraphs:(activity.content?.paragraphs||[]).join('\n\n'),keyPoints:(activity.content?.keyPoints||[]).join('\n'),items:(activity.content?.items||[]).map(item=>typeof item==='string'?item:item.label).join('\n'),rationale:''});
    if(canEdit){
      setBusy(true);
      try {const response=await getHubInstructionVersions(id);if(request===selection.current)setVersions(response.data.versions.sort((a,b)=>b.version_number-a.version_number));}
      catch(error){if(request===selection.current)setNotice(message(error));}
      finally{if(request===selection.current)setBusy(false);}
    }
  };
  const refreshVersions=async()=>setVersions((await getHubInstructionVersions(selected.id)).data.versions.sort((a,b)=>b.version_number-a.version_number));
  const save=async(event)=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{
      const instruction=Object.fromEntries(Object.entries(selected.content||{}).filter(([key])=>fields.includes(key)));
      Object.assign(instruction,{summary:form.summary,paragraphs:form.paragraphs.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean),keyPoints:form.keyPoints.split('\n').map(x=>x.trim()).filter(Boolean)});
      if(selected.activity_type==='checklist')instruction.items=form.items.split('\n').map(x=>x.trim()).filter(Boolean).map((label,index)=>({id:`item-${index}`,label}));
      await createHubInstruction(selected.id,{title:form.title,instruction,changeRationale:form.rationale});
      await refreshVersions();setNotice(es?'Borrador creado. Envíelo a revisión.':'Draft created. Submit it for review.');
    }catch(error){setNotice(message(error));}finally{setBusy(false);}
  };
  const transition=async(version,decision)=>{
    setBusy(true);setNotice('');
    try{
      if(decision==='submit')await submitHubContentVersion(version.id);
      else await reviewHubContentVersion(version.id,{decision,rationale:reviewReason});
      await refreshVersions();setNotice(es?'Estado actualizado.':'Publication state updated.');
      if(decision==='approve')setCatalog((await getHubWorkspaceCatalog()).data);
    }catch(error){setNotice(message(error));}finally{setBusy(false);}
  };
  const update=key=>event=>setForm(current=>({...current,[key]:event.target.value}));
  return <section className="hub-workspace-panel">
    <h2>{es?'Estudio de contenido':'Content studio'}</h2>
    <p>{es?'Edite instrucciones sin cambiar las reglas operativas. Otro administrador debe aprobar la publicación.':'Edit instructions without changing operational rules. A different administrator must approve publication. Existing attempts retain their original lesson.'}</p>
    <button type="button" disabled={busy} onClick={load}>{catalog?(es?'Actualizar catálogo':'Refresh catalog'):(es?'Abrir catálogo':'Open content catalog')}</button>
    {notice&&<p role="status">{notice}</p>}
    {catalog&&<label>{es?'Actividad':'Activity'}<select value={selected?.id||''} disabled={busy} onChange={event=>choose(event.target.value)}>
      <option value="">{es?'Seleccione una actividad':'Choose an activity'}</option>
      {[...catalog.activities].sort((a,b)=>a.title.localeCompare(b.title)).map(row=><option key={row.id} value={row.id}>{catalog.modules.find(module=>module.id===row.module_id)?.title} / {row.title}</option>)}
    </select></label>}
    {selected&&<form onSubmit={save} className="hub-workspace-form">
      <fieldset disabled={busy||!canEdit}>
        <label>{es?'Título':'Lesson title'}<input value={form.title} onChange={update('title')} maxLength={200} required/></label>
        <label>{es?'Resumen':'Summary'}<textarea value={form.summary} onChange={update('summary')} maxLength={12000}/></label>
        <label>{es?'Contenido (separe párrafos con una línea vacía)':'Lesson text (blank line between paragraphs)'}<textarea rows={7} value={form.paragraphs} onChange={update('paragraphs')}/></label>
        <label>{es?'Puntos clave (uno por línea)':'Key points (one per line)'}<textarea rows={4} value={form.keyPoints} onChange={update('keyPoints')}/></label>
        {selected.activity_type==='checklist'&&<label>{es?'Lista (una entrada por línea)':'Checklist (one item per line)'}<textarea value={form.items} onChange={update('items')}/></label>}
        {canEdit&&<><label>{es?'Motivo del cambio':'Reason for change'}<input required value={form.rationale} onChange={update('rationale')} maxLength={2000}/></label><button type="submit">{es?'Crear nueva versión':'Create new draft'}</button></>}
      </fieldset>
      {!canEdit&&<p>{es?'Vista de consulta. ADMIN gestiona versiones y publicación.':'Read-only preview. ADMIN manages content versions and publication.'}</p>}
    </form>}
    {canEdit&&selected&&<div>
      <label>{es?'Motivo de revisión':'Review rationale'}<input value={reviewReason} onChange={event=>setReviewReason(event.target.value)} maxLength={2000}/></label>
      <ul className="hub-version-list">{versions.map(version=><li key={version.id}>
        <strong>v{version.version_number} · {version.status}</strong><p>{version.change_rationale}</p>
        <details><summary>{es?'Ver versión':'Preview version'}</summary><p>{version.content.title}</p><p>{version.content.instruction?.summary}</p>{(version.content.instruction?.paragraphs||[]).map((p,i)=><p key={i}>{p}</p>)}</details>
        {version.status==='draft'&&<button type="button" disabled={busy} onClick={()=>transition(version,'submit')}>{es?'Enviar a revisión':'Submit for review'}</button>}
        {version.status==='pending_review'&&<><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>transition(version,'approve')}>{es?'Aprobar':'Approve publication'}</button><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>transition(version,'reject')}>{es?'Rechazar':'Reject'}</button></>}
      </li>)}</ul>
    </div>}
  </section>;
}
