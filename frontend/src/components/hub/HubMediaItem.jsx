import {useRef,useState} from 'react';
import {getHubMediaAccess} from '../../api/client';

export default function HubMediaItem({assetId,label='Open training asset'}){
  const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const position=useRef(0);
  const open=async()=>{setBusy(true);setNotice('');setData(null);try{setData((await getHubMediaAccess(assetId)).data);}catch(error){setNotice(error?.response?.data?.error?.message||'This training asset could not be opened.');}finally{setBusy(false);}};
  return <section className="hub-media-item"><button type="button" disabled={busy} onClick={open}>{busy?'Opening asset…':data?'Refresh private access':label}</button>
    {notice&&<p role="status">{notice}</p>}
    {data&&<><h4>{data.asset.title} · v{data.asset.version}</h4>
      {data.asset.mimeType.startsWith('image/')&&<img src={data.url} alt={data.asset.altText} loading="lazy" onError={()=>setNotice('The image could not be displayed. Refresh access or open the file.')}/>}
      {data.asset.mimeType.startsWith('video/')&&<video controls preload="metadata" src={data.url} onTimeUpdate={event=>{position.current=event.currentTarget.currentTime;}} onLoadedMetadata={event=>{if(position.current<event.currentTarget.duration)event.currentTarget.currentTime=position.current;}} onError={()=>setNotice('The video could not be played. Refresh access or open the file.')}/>}
      {data.asset.transcript&&<details><summary>Transcript</summary><p className="hub-note-body">{data.asset.transcript}</p></details>}
      <p><a href={data.url} target="_blank" rel="noopener noreferrer">Open {data.asset.fileName} in a new tab</a></p>
    </>}
  </section>;
}
