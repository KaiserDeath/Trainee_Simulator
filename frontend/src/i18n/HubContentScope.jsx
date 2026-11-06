import {HubContentContext} from './HubContentContext';
export default function HubContentScope({translation,children}){return <HubContentContext.Provider value={translation?.es||null}>{children}</HubContentContext.Provider>;}
