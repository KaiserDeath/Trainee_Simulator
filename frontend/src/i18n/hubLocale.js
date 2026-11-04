import spanish from './hub-es.json' with {type:'json'};
const own=(map,key)=>Object.hasOwn(map,key)?map[key]:undefined;

export const hubMessage=(key,args=[])=>({key,args});
export const hubText=value=>({localize:true,value});
const labels={passed:'Passed',active:'Active',inactive:'Inactive',deactivated:'Deactivated',assigned:'Assigned',in_progress:'In progress',completed:'Completed',withdrawn:'Withdrawn',not_started:'Not started',open:'Open',closed:'Closed',verified:'Verified',pending:'Pending',approved:'Approved',rejected:'Rejected',draft:'Draft',pending_review:'Pending review',published:'Published',retired:'Retired',awaiting_upload:'Awaiting upload',expired:'Expired',available:'Available',not_ready:'Not ready',successful:'Successful',unsuccessful:'Unsuccessful',submitted:'Submitted',scored:'Scored',timed_out:'Timed out',abandoned:'Abandoned',cancelled:'Cancelled',requested:'Requested',disposed:'Disposed',held:'Held',eligible:'Eligible',blocked:'Blocked',article:'Article',acknowledgement:'Acknowledgement',interactive_rule_lab:'Account ID Lab',focused_practice:'Focused practice',quick_simulation:'Quick simulation',full_simulation:'Full simulation',official_evaluation:'Official evaluation',mixed_practice:'Mixed practice',ADMIN:'Administrator',TRAINER:'Trainer',POSTULANTE:'Participant',RRHH:'HR',CREATE_ACCOUNT:'Create Account',SEARCH_USER:'Search User',VERIFY_BALANCE:'Verify Balance',ADD_CREDITS:'Add Credits',WITHDRAW_CREDITS:'Withdraw Credits',REVIEW_TRANSACTION_RECORDS:'Review Transaction Records',RESET_PASSWORD_EDIT_INFORMATION:'Reset Password / Edit Information',BACKEND_CREATE_ACCOUNT:'Create Account in Backend',BACKEND_REFRESH_BALANCE:'Refresh Balance in Backend',BACKEND_ADD_CREDITS:'Approve Add Credits in Backend',BACKEND_WITHDRAW_CREDITS:'Approve Withdraw Credits in Backend',BACKEND_RESET_PASSWORD:'Confirm Password Reset in Backend',RESOLVE_RECONCILIATION:'Resolve Reconciliation',CUSTOMER_RESPONSE:'Customer Response'};
export const hubServerMessage=(message,fallback=hubMessage('The action could not be recorded. Retry this action.'))=>message&&typeof message==='object'?message:{key:message||fallback.key,args:[],fallback:fallback.key};
export function translateHub(locale,message,args=[],content={}){
  let fallback;
  if(message&&typeof message==='object'){fallback=message.fallback;args=message.args||[];message=message.key||'';}
  if(typeof message!=='string')return message??'';
  const original=message.trim();
  const core=own(labels,original)||own(labels,original.replaceAll(' ','_').toUpperCase())||own(labels,original.replaceAll(' ','_').toLowerCase())||original;
  const translated=locale==='es'?(own(spanish,core)??own(content,core)??(fallback?own(spanish,fallback):null)??core):core.replaceAll('Postulantes','Participants').replaceAll('Postulante','Participant');
  const result=translated.replace(/\{(\d+)\}/g,(_,index)=>{const value=args[Number(index)];return value?.localize?translateHub(locale,value.value,[],content):String(value??'');});
  return message.slice(0,message.indexOf(original))+result+message.slice(message.indexOf(original)+original.length);
}
export function storedHubLocale(key){try{const value=localStorage.getItem(`trez.hub.locale.${key}`);return ['en','es'].includes(value)?value:null;}catch{return null;}}
export function saveHubLocale(key,locale){try{localStorage.setItem(`trez.hub.locale.${key}`,locale);}catch{/* Session language still works when storage is blocked. */}}
export function clearHubLocale(key){try{localStorage.removeItem(`trez.hub.locale.${key}`);}catch{/* Optional persistence. */}}
export function hubValidationMessage(validity){
  if(validity.valueMissing)return 'Complete this field.';
  if(validity.patternMismatch)return 'Use the required format.';
  if(validity.tooShort)return 'Enter a longer value.';
  if(validity.tooLong)return 'Enter a shorter value.';
  if(validity.rangeUnderflow||validity.rangeOverflow)return 'Enter a value within the permitted range.';
  if(validity.stepMismatch)return 'Use a valid increment.';
  return 'Enter a valid value.';
}
