import {createContext,useContext} from 'react';
import {useHubLocale} from './HubLocaleContext';
import {scopedContentText} from './hubContent';
export const HubContentContext=createContext(null);
export function useHubContentText(){const map=useContext(HubContentContext);const {locale,t}=useHubLocale();return source=>scopedContentText(locale,source,map,t);}
