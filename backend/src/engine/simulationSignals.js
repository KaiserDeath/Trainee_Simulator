import {EventEmitter} from 'node:events';

const signals=new EventEmitter();
export const notifySimulationWork=()=>signals.emit('work');
export function onSimulationWork(listener){signals.on('work',listener);return()=>signals.off('work',listener);}
