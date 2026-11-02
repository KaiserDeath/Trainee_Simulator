import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertLocalE2EBackendEnvironment} from '../backend/src/config/localE2EGuard.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const tasks={capacity:'runHubCapacity.mjs'};
const target=tasks[process.argv[2]];
if(!target)throw new Error('Choose a supported local verification task.');
const status=spawnSync(process.execPath,[path.join(root,'node_modules/supabase/dist/supabase.js'),'status','-o','env'],{cwd:root,encoding:'utf8',windowsHide:true});
if(status.status!==0)throw new Error('The named isolated local Supabase stack must be running.');
const values=new Map((status.stdout||'').split(/\r?\n/).map(line=>line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map(match=>[match[1],match[2].trim().replace(/^"|"$/g,'')]));
const env={...process.env,NODE_ENV:'test',TREZ_LOCAL_E2E:'1',TREZ_E2E_BACKEND_URL:'http://127.0.0.1:8080',TREZ_E2E_FRONTEND_URL:'http://127.0.0.1:4173',TREZ_E2E_DATABASE_URL:values.get('DB_URL'),SUPABASE_URL:values.get('API_URL'),SUPABASE_ANON_KEY:values.get('ANON_KEY'),SUPABASE_SERVICE_ROLE_KEY:values.get('SERVICE_ROLE_KEY'),CLIENT_URL:'http://127.0.0.1:4173'};
env.HOST='127.0.0.1';
assertLocalE2EBackendEnvironment(env);
const result=spawnSync(process.execPath,[path.join(root,'backend/test/integration',target)],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;
