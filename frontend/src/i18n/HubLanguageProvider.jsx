import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {HubLocaleContext,useHubLocale} from './HubLocaleContext';
import {storedHubLocale,saveHubLocale,clearHubLocale,translateHub} from './hubLocale';

export function HubLocaleProvider({children}){
  const [locale,setLocaleState]=useState(()=>storedHubLocale('guest')||'en');
  const [translations,setTranslations]=useState({});
  const [translationIssues,setTranslationIssues]=useState({});
  const identity=useRef('guest');
  const setLocale=useCallback(value=>{
    if(!['en','es'].includes(value))return;
    if(identity.current==='guest')saveHubLocale('pending',value);
    saveHubLocale(identity.current,value);saveHubLocale('guest',value);setLocaleState(value);
  },[]);
  const setIdentity=useCallback(person=>{
    const key=person?.id||'guest';if(identity.current===key)return;
    const pending=storedHubLocale('pending');
    const selected=pending||storedHubLocale(key)||(person?.preferredLocale==='es'?'es':'en');
    if(pending){saveHubLocale(key,pending);clearHubLocale('pending');}
    identity.current=key;setTranslations({});setTranslationIssues({});setLocaleState(selected);
  },[]);
  useEffect(()=>{
    const receive=event=>{const entries=Object.entries(event.detail||{}).filter(([key,value])=>key.length<=4000&&typeof value==='string'&&value.length<=12000).slice(0,1000);setTranslations(previous=>({...previous,...Object.fromEntries(entries)}));};
    const sync=event=>{if(event.key===`trez.hub.locale.${identity.current}`&&['en','es'].includes(event.newValue))setLocaleState(event.newValue);};
    const status=event=>{if(['learning','runtime','evidence','bank'].includes(event.detail?.scope))setTranslationIssues(previous=>({...previous,[event.detail.scope]:event.detail.unavailable===true}));};
    window.addEventListener('trez-hub-translations',receive);window.addEventListener('storage',sync);
    window.addEventListener('trez-hub-translation-status',status);
    return()=>{window.removeEventListener('trez-hub-translations',receive);window.removeEventListener('storage',sync);window.removeEventListener('trez-hub-translation-status',status);};
  },[]);
  useEffect(()=>{const previous=document.documentElement.lang;document.documentElement.lang=locale;return()=>{document.documentElement.lang=previous;};},[locale]);
  const value=useMemo(()=>({locale,setLocale,setIdentity,contentTranslationIssues:translationIssues,contentTranslationUnavailable:Object.values(translationIssues).some(Boolean),t:(message,args)=>translateHub(locale,message,args,translations),formatDate:(value,options={dateStyle:'medium',timeStyle:'short'})=>value?new Intl.DateTimeFormat(locale==='es'?'es-PE':'en-US',options).format(new Date(value)):'—'}),[locale,setLocale,setIdentity,translations,translationIssues]);
  return <HubLocaleContext.Provider value={value}>{children}</HubLocaleContext.Provider>;
}
export function HubLanguageSwitch(){
  const {locale,setLocale,t}=useHubLocale();
  return <div className="hub-language-switch" role="group" aria-label={t('Language')}>
    <button type="button" lang="en" aria-pressed={locale==='en'} onClick={()=>setLocale('en')}>English</button>
    <button type="button" lang="es" aria-pressed={locale==='es'} onClick={()=>setLocale('es')}>Español</button>
  </div>;
}
