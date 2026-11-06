import { useEffect,useState } from 'react';
import { getHubContext } from '../../api/client';

export default function SimulatorIdentityBoundary({children,trainer=false}){
  const [state,setState]=useState({loading:true});
  useEffect(()=>{
    let active=true;
    getHubContext().then(response=>{if(active)setState({identity:response.data.subject,loading:false});})
      .catch(()=>{if(active)setState({loading:false});});
    return()=>{active=false;};
  },[]);
  if(state.loading)return <main className="hub-state-page"><p role="status">Checking your training identity…</p></main>;
  if(state.identity?.mustChangePassword)return <main><p>Change your temporary password before continuing.</p><a href="/hub">Open Training Hub</a></main>;
  const required=trainer?'TRAINER':'POSTULANTE';
  if(!state.identity?.roles?.includes(required))return <main className="hub-state-page"><h1>{state.identity?'This workspace requires a different role':'Sign in to continue'}</h1><p>Use your Training Hub account to access this workspace.</p><a href="/hub">Open Training Hub</a></main>;
  return children;
}
