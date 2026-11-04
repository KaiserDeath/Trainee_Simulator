import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useRef,useState} from 'react';
import {getHubMediaLibrary,beginHubMediaUpload,transitionHubMedia} from '../../api/client';
import HubMediaItem from './HubMediaItem';

const empty={key:'',title:'',altText:'',transcript:'',source:''};
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm'};
export default function HubMediaLibrary({canEdit}){
  const {t} = useHubLocale();
  const [assets,setAssets]=useState(null);const [form,setForm]=useState(empty);const [file,setFile]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [reason,setReason]=useState('');
  const retry=useRef(null);const fileInput=useRef(null);
  const load=async()=>{setBusy(true);setNotice('');try{setAssets((await getHubMediaLibrary()).data.assets);}catch{setNotice(hubMessage("The private media library could not be loaded."));}finally{setBusy(false);}};
  const change=key=>event=>{setForm(current=>({...current,[key]:event.target.value}));retry.current=null;};
  const upload=async event=>{
    event.preventDefault();if(!file){setNotice(hubMessage("Choose a supported training file."));return;}if(file.size<1||file.size>25000000){setNotice(hubMessage("Choose a file between 1 byte and 25 MB."));return;}
    const mimeType=file.type||types[file.name.split('.').at(-1).toLowerCase()];
    setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{
      const result=(await beginHubMediaUpload({...form,fileName:file.name,mimeType,size:file.size,idempotencyKey:retry.current})).data;
      // Completion verifies the stored object even after an uncertain upload response.
      if(!result.alreadyUploaded){try{await fetch(result.uploadUrl,{method:'PUT',headers:{'content-type':mimeType,'x-upsert':'false','cache-control':'max-age=0'},body:file});}catch{/* Resolve the uncertain result through the authoritative completion check. */}}
      await transitionHubMedia(result.asset.id,'complete',{idempotencyKey:`${retry.current}:complete`});
      setAssets((await getHubMediaLibrary()).data.assets);setForm(empty);setFile(null);if(fileInput.current)fileInput.current.value='';retry.current=null;setNotice(hubMessage("File stored privately. A different ADMIN must review publication."));
    }catch(error){if(error?.response?.status===410)retry.current=null;setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("The training file could not be uploaded. Retry this upload."), hubMessage("The training file could not be uploaded. Retry this upload.")));}finally{setBusy(false);}
  };
  const review=async(asset,command)=>{setBusy(true);setNotice('');try{await transitionHubMedia(asset.id,command,{reason,idempotencyKey:crypto.randomUUID()});setAssets((await getHubMediaLibrary()).data.assets);setNotice(hubMessage("Asset publication state updated."));}catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("This media action could not be recorded."), hubMessage("This media action could not be recorded.")));}finally{setBusy(false);}};
  return <section className="hub-workspace-panel"><h2>{t("Private training media")}</h2><p>{t("Versioned images, PDFs and videos. Files stay private; lesson access uses expiring links. Images require alternative text and videos require a transcript.")}</p>
    <button type="button" disabled={busy} onClick={load}>{assets?t("Refresh media library"):t("Open media library")}</button>{notice&&<p role="status">{t(notice)}</p>}
    {assets&&canEdit&&<form onSubmit={upload}><fieldset disabled={busy}><legend>{t("Upload a new asset version")}</legend>
      <label>{t("Resource code")}<input required pattern="[a-z][a-z0-9-]{2,99}" value={form.key} onChange={change('key')}/></label><label>{t("Asset title")}<input required maxLength={200} value={form.title} onChange={change('title')}/></label>
      <label>{t("Training file (25 MB maximum)")}<input ref={fileInput} required type="file" accept=".png,.jpg,.jpeg,.pdf,.mp4,.webm" onChange={event=>{setFile(event.target.files?.[0]||null);retry.current=null;}}/></label>
      <label>{t("Alternative text for images")}<textarea maxLength={2000} value={form.altText} onChange={change('altText')}/></label><label>{t("Transcript for video")}<textarea maxLength={50000} value={form.transcript} onChange={change('transcript')}/></label>
      <label>{t("Source and approval reference")}<textarea required minLength={5} maxLength={2000} value={form.source} onChange={change('source')}/></label><button type="submit">{t("Upload private asset")}</button>
    </fieldset></form>}
    {assets&&canEdit&&<label>{t("Media review reason")}<input minLength={5} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/></label>}
    {assets&&<ul className="hub-version-list">{assets.map(asset=><li key={asset.id}><strong>{asset.title}{t(" · v")}{asset.version} · {t(asset.status)}</strong><p>{asset.file_name} · {Math.ceil(asset.expected_size/1000)}{t(" KB")}</p><p>{t("Source: ")}{asset.source_reference}</p>
      {asset.status==='expired'?<p>{t("This upload expired. Upload a new asset version to continue.")}</p>:<HubMediaItem assetId={asset.id} label={t("Preview training asset")}/>}
      {canEdit&&asset.canComplete&&<button type="button" disabled={busy} onClick={()=>review(asset,'complete')}>{t("Check uploaded file")}</button>}
      {canEdit&&asset.status==='pending_review'&&<><button type="button" disabled={busy||!asset.canReview||reason.trim().length<5} onClick={()=>review(asset,'approve')}>{t("Approve media publication")}</button><button type="button" disabled={busy||!asset.canReview||reason.trim().length<5} onClick={()=>review(asset,'reject')}>{t("Reject media")}</button></>}
      {canEdit&&asset.status==='published'&&<button type="button" disabled={busy||reason.trim().length<5} onClick={()=>review(asset,'retire')}>{t("Retire asset version")}</button>}
    </li>)}</ul>}
  </section>;
}
