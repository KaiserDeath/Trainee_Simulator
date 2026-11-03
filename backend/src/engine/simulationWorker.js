import {pathToFileURL} from 'node:url';
import {supabase} from '../config/supabase.js';
import GameMaster from './GameMaster.js';
import {startSimulationWorker as startRunner} from './simulationJobRunner.js';
import {onSimulationWork} from './simulationSignals.js';
export function startSimulationWorker(options={}){
 const worker=startRunner({client:supabase,gameMaster:GameMaster,...options});const unsubscribe=onSimulationWork(()=>worker.wake());
 return {...worker,stop(){unsubscribe();worker.stop();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const worker=startSimulationWorker();
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{worker.stop();process.exitCode=0;});
}
