export function localCapacityClientCount(environment=process.env){
  const value=environment.TREZ_LOCAL_CAPACITY_CLIENTS??'10';
  if(!/^(?:[1-9][0-9]?|100)$/.test(String(value)))throw new Error('TREZ_LOCAL_CAPACITY_CLIENTS must be an integer from 1 to 100. This configures local verification only.');
  return Number(value);
}

// Drain every in-flight client before allowing fixture cleanup, even on failure.
export async function settleCapacityClients(jobs,label){
  const results=await Promise.allSettled(jobs.map(job=>Promise.resolve().then(job)));
  const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(errors.length)throw new AggregateError(errors,label);
  return results.map(result=>result.value);
}
