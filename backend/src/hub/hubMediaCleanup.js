export function createHubMediaCleanup({client}) {
  const checked=result=>{if(result.error)throw new Error('Media cleanup database operation failed.');return result.data;};
  async function command(mode,limit,job){
    return checked(await client.rpc('hub_media_cleanup',{p_mode:mode,p_limit:limit,p_asset_id:job?.assetId??null,p_claim_token:job?.claimToken??null}));
  }
  return Object.freeze({
    async run({apply=false,limit=100}={}) {
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Cleanup limit must be between 1 and 100.');
      const jobs=await command(apply?'claim':'preview',limit);
      if(!apply)return {mode:'preview',candidates:jobs.length,limit};
      let removed=0,failed=0;
      for(const job of jobs){
        // Never accept paths/buckets from a user request or environment variable.
        if(job.bucket!=='trez-hub-training-assets'||!new RegExp(`^${job.assetId}/asset\\.(png|jpg|pdf|mp4|webm)$`,'i').test(job.objectPath))throw new Error('Unexpected cleanup object path.');
        let error;
        try{const result=await client.storage.from(job.bucket).remove([job.objectPath]);error=result.error;}catch{error=true;}
        await command(error?'retry':'complete',limit,job);
        if(error)failed++;else removed++;
      }
      return {mode:'apply',claimed:jobs.length,removed,failed,limit};
    },
  });
}
