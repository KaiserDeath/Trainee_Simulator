import {useEffect,useRef,useState} from 'react';
import {getHubFormalRetention,changeHubFormalRetention} from '../../api/client';

const reasons={attempt_set_not_closed:'The attempt set is not closed',retention_not_elapsed:'Two-year retention has not elapsed',retention_hold:'An evidence hold is active',already_disposed:'Detailed evidence was disposed',no_evidence_packet:'No detailed evidence packet exists',active_sandbox:'Sandbox activity is still active',shared_sandbox:'Another workflow references this sandbox',unattributed_retry_cache:'A legacy retry cache cannot be safely attributed',unreviewed_dependency:'A database dependency requires review'};
const records={actions:'Recorded actions',stages:'Recorded stages',items:'Scoring detail rows',runtime:'Theory and assessment setup',worlds:'Sandbox sessions',settlements:'Settlement snapshots',retries:'Cached action responses',gameHistory:'Game history',backendHistory:'Backend history',operations:'Sandbox operations',accounts:'Sandbox accounts',customers:'Simulated customers',actionLogs:'Interaction logs'};
export default function HubFormalRetention({attemptId,onDisposed}){
  const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [action,setAction]=useState('');const [reason,setReason]=useState('');const retry=useRef(null);const input=useRef(null);
  useEffect(()=>{if(action)input.current?.focus();},[action]);
  const load=async()=>{const next=(await getHubFormalRetention(attemptId)).data;setData(next);if(next.case.state==='disposed')onDisposed(next.case);};
  const open=async()=>{setBusy(true);setNotice('');try{await load();setAction('');}catch(error){setNotice(error?.response?.data?.error?.message||'Evidence retention preview could not be loaded.');}finally{setBusy(false);}};
  const choose=command=>{setAction(command);setReason('');retry.current=null;setNotice('');};
  const submit=async event=>{
    event.preventDefault();setBusy(true);setNotice('');retry.current ||= crypto.randomUUID();
    try{
      const result=(await changeHubFormalRetention(attemptId,{command:action,expectedRevision:data.case.revision,reason,idempotencyKey:retry.current})).data;
      if(result.state==='disposed')onDisposed(result);
      await load();setAction('');setReason('');retry.current=null;setNotice('Evidence retention action recorded.');
    }catch(error){setNotice(error?.response?.data?.error?.message||'The evidence retention action could not be recorded. Retry.');}finally{setBusy(false);}
  };
  const labels={hold:'Confirm evidence hold',release:'Release evidence hold',request:'Send evidence disposal request',cancel:'Cancel evidence disposal request',approve:'Approve evidence disposal'};
  return <section aria-label="Formal evidence retention"><h5>Detailed evidence retention</h5>
    <p>Two-year minimum retention covers this closed attempt’s detailed packet. Scores, consumed attempts, policy and readiness stay recorded. A different TRAINER must approve disposal.</p>
    <button type="button" disabled={busy} onClick={open}>{data?'Refresh evidence retention':'Open evidence retention'}</button>
    {notice&&<p role="status">{notice}</p>}
    {data&&<>
      {data.case.state==='disposed'?<p role="status">Detailed evidence disposed on {new Date(data.case.disposed_at).toLocaleString()}. The recorded result remains.</p>:<>
        <p>Minimum retention until {data.retainUntil?new Date(data.retainUntil).toLocaleString():'completion is recorded'}</p>
        {data.blockers.map(code=><p key={code}>{reasons[code]||code}</p>)}
        <details><summary>Packet record counts</summary><ul>{Object.entries(data.counts).map(([name,count])=><li key={name}>{records[name]||name}: {count}</li>)}</ul></details>
        {data.case.held&&<p className="hub-note-body">Hold: {data.case.hold_reason}</p>}
        {data.canManage&&<>
          <button type="button" disabled={busy} onClick={()=>choose(data.case.held?'release':'hold')}>{data.case.held?'Review evidence hold release':'Place evidence hold'}</button>
          {data.case.state!=='pending'&&<button type="button" disabled={busy||!data.eligible} onClick={()=>choose('request')}>Request evidence disposal</button>}
          {data.case.state==='pending'&&<><p className="hub-note-body">Pending request: {data.case.request_reason}</p>
            <button type="button" disabled={busy||!data.eligible||data.case.requested_by===data.viewerId} onClick={()=>choose('approve')}>Review evidence disposal</button>
            {data.case.requested_by===data.viewerId&&<p>Another TRAINER must approve this packet.</p>}
            <button type="button" disabled={busy} onClick={()=>choose('cancel')}>Review evidence request cancellation</button>
          </>}
        </>}
      </>}
    </>}
    {action&&<form onSubmit={submit}><fieldset disabled={busy}><legend>{labels[action]}</legend>
      {action==='approve'&&<p>This permanently removes theory responses, action/stage detail, related sandbox records and attributed cached responses. Scores and attempt limits remain unchanged.</p>}
      <label>Brief evidence retention reason (omit private evidence)<textarea ref={input} required minLength={5} maxLength={500} value={reason} onChange={event=>{setReason(event.target.value);retry.current=null;}}/></label>
      <button type="submit">{labels[action]}</button><button type="button" onClick={()=>{setAction('');retry.current=null;}}>Cancel evidence action</button>
    </fieldset></form>}
  </section>;
}
