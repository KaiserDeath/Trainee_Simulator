import {createContext,useContext} from 'react';
import {translateHub} from './hubLocale';
export const HubLocaleContext=createContext({locale:'en',t:(message,args)=>translateHub('en',message,args)});
export const useHubLocale=()=>useContext(HubLocaleContext);
