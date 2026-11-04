import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import {useRef,useState} from 'react';
import {getHubMediaAccess} from '../../api/client';

export default function HubMediaItem({assetId,label='Open training asset'}){
  const {t} = useHubLocale();
  const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const position=useRef(0);
  const open=async()=>{setBusy(true);setNotice('');setData(null);try{setData((await getHubMediaAccess(assetId)).data);}catch(error){setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("This training asset could not be opened."), hubMessage("This training asset could not be opened.")));}finally{setBusy(false);}};
  return <section className="hub-media-item"><button type="button" disabled={busy} onClick={open}>{busy?t("Opening asset…"):data?t("Refresh private access"):label}</button>
    {notice&&<p role="status">{t(notice)}</p>}
    {data&&<><h4>{t(data.asset.title)}{t(" · v")}{data.asset.version}</h4>
      {data.asset.mimeType.startsWith('image/')&&<img src={data.url} alt={data.asset.altText} loading="lazy" onError={()=>setNotice(hubMessage("The image could not be displayed. Refresh access or open the file."))}/>}
      {data.asset.mimeType.startsWith('video/')&&<video controls preload="metadata" src={data.url} onTimeUpdate={event=>{position.current=event.currentTarget.currentTime;}} onLoadedMetadata={event=>{if(position.current<event.currentTarget.duration)event.currentTarget.currentTime=position.current;}} onError={()=>setNotice(hubMessage("The video could not be played. Refresh access or open the file."))}/>}
      {data.asset.transcript&&<details><summary>{t("Transcript")}</summary><p className="hub-note-body">{data.asset.transcript}</p></details>}
      <p><a href={data.url} target="_blank" rel="noopener noreferrer">{t("Open ")}{data.asset.fileName}{t(" in a new tab")}</a></p>
    </>}
  </section>;
}
