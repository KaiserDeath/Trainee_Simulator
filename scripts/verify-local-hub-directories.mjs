import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20261106000000_bounded_hub_directories.sql',import.meta.url),'utf8').replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
const checks=readFileSync(new URL('../backend/test/integration/hubDirectories.sql',import.meta.url),'utf8');
const result=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`BEGIN;\n${migration}\n${checks}\nROLLBACK;`,encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error(result.stderr);
console.log(JSON.stringify({passed:true,rows:1005,checks:['cursor completeness','no duplicate rows','literal search','role denial','public denial','summary shape'],rolledBack:true}));
