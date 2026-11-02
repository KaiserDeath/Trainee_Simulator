import {useState} from 'react';
import {getHubAccountPolicies,proposeHubAccountPolicy,reviewHubAccountPolicy} from '../../api/client';

export default function HubPolicyStudio({locale='en'}){
  const es=locale==='es';const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [form,setForm]=useState({basePolicyId:'',label:'',prefix:'',suffix:'',customerLength:6,digits:3,rationale:''});
  const [reviewReason,setReviewReason]=useState('');
  const fail=error=>setNotice(error?.response?.data?.error?.message||(es?'No se pudo actualizar la política.':'Account policy could not be updated.'));
  const load=async()=>{setBusy(true);try{setData((await getHubAccountPolicies()).data);}catch(error){fail(error);}finally{setBusy(false);}};
  const choose=id=>{
    const base=data.policies.find(row=>row.id===id);const segments=base?.policy?.segments||[];
    setForm({basePolicyId:id,label:base?.policy.label||'',prefix:segments.find(row=>row.key==='prefix')?.value||'',suffix:segments.find(row=>row.key==='suffix')?.value||'',customerLength:segments.find(row=>row.kind==='customer')?.maxLength||6,digits:segments.find(row=>row.kind==='random-digits')?.length||3,rationale:''});
  };
  const submit=async event=>{
    event.preventDefault();setBusy(true);setNotice('');
    try{const {basePolicyId,rationale,...configuration}=form;await proposeHubAccountPolicy({basePolicyId,rationale,configuration});setData((await getHubAccountPolicies()).data);setNotice(es?'Propuesta enviada. Otro administrador debe revisarla.':'Proposal submitted. A different administrator must review it.');}
    catch(error){fail(error);}finally{setBusy(false);}
  };
  const review=async(id,decision)=>{
    setBusy(true);setNotice('');try{await reviewHubAccountPolicy(id,{decision,rationale:reviewReason});setData((await getHubAccountPolicies()).data);setNotice(es?'Revisión registrada.':'Policy review recorded. Active attempts keep their original policy.');}catch(error){fail(error);}finally{setBusy(false);}
  };
  const update=key=>event=>setForm(current=>({...current,[key]:['digits','customerLength'].includes(key)?Number(event.target.value):event.target.value}));
  return <section className="hub-workspace-panel"><h2>{es?'Políticas de identificadores':'Account ID policies'}</h2>
    <p>{es?'Las reglas se publican como nuevas versiones. Los intentos existentes conservan su versión original.':'Change identifier rules through reviewed versions. Existing attempts keep their original policy. Publishing applies the new policy to future account practice.'}</p>
    <button type="button" disabled={busy} onClick={load}>{es?'Abrir políticas':'Open account policies'}</button>{notice&&<p role="status">{notice}</p>}
    {data&&<><label>{es?'Versión base':'Base policy version'}<select disabled={busy} value={form.basePolicyId} onChange={event=>choose(event.target.value)}><option value="">{es?'Seleccione una versión':'Choose a policy version'}</option>{data.policies.map(row=><option key={row.id} value={row.id}>{row.game} · v{row.version} · {row.policy.label}</option>)}</select></label>
      {form.basePolicyId&&<form onSubmit={submit}><fieldset disabled={busy}>
        <label>{es?'Nombre de política':'Policy label'}<input required value={form.label} onChange={update('label')} maxLength={200}/></label>
        <label>{es?'Prefijo':'Prefix'}<input value={form.prefix} onChange={update('prefix')} maxLength={16}/></label>
        <label>{es?'Caracteres del cliente':'Customer characters'}<input type="number" min={1} max={32} required value={form.customerLength} onChange={update('customerLength')}/></label>
        <label>{es?'Sufijo antes de los dígitos':'Suffix before digits'}<input value={form.suffix} onChange={update('suffix')} maxLength={16}/></label>
        <label>{es?'Dígitos aleatorios':'Random digits'}<input type="number" min={1} max={8} required value={form.digits} onChange={update('digits')}/></label>
        <label>{es?'Motivo':'Reason for policy change'}<input required maxLength={2000} value={form.rationale} onChange={update('rationale')}/></label>
        <button type="submit">{es?'Enviar propuesta':'Submit policy proposal'}</button>
      </fieldset></form>}
      <label>{es?'Motivo de revisión':'Policy review rationale'}<input value={reviewReason} onChange={event=>setReviewReason(event.target.value)} maxLength={2000}/></label>
      <ul className="hub-version-list">{data.proposals.map(row=><li key={row.id}><strong>{row.configuration.label} · {row.status}</strong><p>{row.change_rationale}</p><p>{row.configuration.prefix} + {row.configuration.customerLength} customer characters + {row.configuration.suffix} + {row.configuration.digits} digits</p>
        {row.status==='pending_review'&&<><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>review(row.id,'approve')}>{es?'Aprobar política':'Approve policy'}</button><button type="button" disabled={busy||!reviewReason.trim()} onClick={()=>review(row.id,'reject')}>{es?'Rechazar política':'Reject policy'}</button></>}
      </li>)}</ul>
    </>}
  </section>;
}
