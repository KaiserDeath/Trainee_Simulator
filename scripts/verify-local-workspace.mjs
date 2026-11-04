import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Intentionally no env file, host argument, or remote target accepted.
const container='supabase_db_simulador-dos-local';
const inspect=spawnSync('docker',['inspect','--format','{{.State.Running}}',container],{encoding:'utf8',windowsHide:true});
if(inspect.status!==0||inspect.stdout.trim()!=='true')throw new Error('Named isolated local database is not running. Start the local stack first.');
const sql=['hubWorkspace.sql','hubEvaluationRuntime.sql','hubBackendEvaluation.sql','hubCustomerEvaluation.sql','hubEvaluationPolicyVersions.sql','hubFinalEvaluation.sql','hubMixedPractice.sql','hubCohorts.sql','hubCoachingRetention.sql'].map(name=>readFileSync(fileURLToPath(new URL(`../backend/test/integration/${name}`,import.meta.url)),'utf8')).join('\n');
const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});
if(result.status!==0){process.stderr.write(result.stderr||'Local workspace verification failed.');process.exit(1);}
console.log('Local workspace verification passed: content/coaching, Orion continuity/reset/exceptions, durable delivery/recovery, four assessment runtimes, official curriculum gates, immutable policy/question versions, deadline/retry rules, private evidence, cohort assignments, target dates, paging, progress preservation and governed coaching retention/disposal. All fixtures rolled back.');
