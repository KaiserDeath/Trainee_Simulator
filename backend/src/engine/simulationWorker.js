import {pathToFileURL} from 'node:url';
import {supabase} from '../config/supabase.js';
import GameMaster from './GameMaster.js';
import {startSimulationWorker as startRunner} from './simulationJobRunner.js';
export function startSimulationWorker(options={}){return startRunner({client:supabase,gameMaster:GameMaster,...options});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const worker=startSimulationWorker();
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{worker.stop();process.exitCode=0;});
}
