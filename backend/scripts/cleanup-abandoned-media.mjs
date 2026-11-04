import {supabase} from '../src/config/supabase.js';
import {createHubMediaCleanup} from '../src/hub/hubMediaCleanup.js';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--apply'&&!/^--limit=\d+$/.test(arg)))throw new Error('Use --apply and/or --limit=1..100; the default is a read-only preview.');
try{
  const result=await createHubMediaCleanup({client:supabase}).run({apply:args.includes('--apply'),limit:Number(args.find(arg=>arg.startsWith('--limit='))?.slice(8)??100)});
  console.log(JSON.stringify(result));
  if(result.failed)process.exitCode=1;
}catch{
  console.error('Abandoned media cleanup failed; unfinished claims remain retryable.');process.exitCode=1;
}
