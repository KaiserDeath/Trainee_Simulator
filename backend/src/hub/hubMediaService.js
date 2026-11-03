import {HubError} from './HubError.js';
import {workspaceUuid} from './hubWorkspaceService.js';

export function createHubMediaService({client}){
  const checked=result=>{
    if(!result.error)return result.data;
    const message=String(result.error.message||'');
    const mappings=[['HUB_ACCESS_DENIED',403,'This identity cannot access this training asset.'],['HUB_OBJECT_NOT_FOUND',404,'The training asset was not found.'],['HUB_SEPARATE_APPROVER_REQUIRED',409,'A different administrator must review this asset.'],['HUB_MEDIA_STATE_CONFLICT',409,'The asset changed. Reload the library before reviewing it.'],['HUB_IDEMPOTENCY_CONFLICT',409,'The retry key belongs to another change.'],['HUB_MEDIA_UPLOAD_INCOMPLETE',409,'The uploaded file does not yet match the registered size and type.'],['HUB_INVALID_INPUT',400,'Provide a supported file, source, size and accessible description.']];
    const match=mappings.find(([code])=>message.includes(code));
    throw match?new HubError(match[1],match[0],match[2]):new HubError(503,'HUB_MEDIA_UNAVAILABLE','Training media is temporarily unavailable.');
  };
  const actor=async(identity,roles)=>checked(await client.rpc('hub_require_active_role',{p_external_subject:identity.subjectId,p_allowed_roles:roles}));
  async function command(identity,id,operation,metadata,key){
    if(typeof key!=='string'||!key.trim()||key.length>200)throw new HubError(400,'HUB_VALIDATION_ERROR','A retry key is required.');
    return checked(await client.rpc('hub_media_command',{p_external_subject:identity.subjectId,p_command:operation,p_asset_id:id,p_metadata:metadata,p_idempotency_key:key}));
  }
  return Object.freeze({
    async list(identity){
      const actorId=await actor(identity,['admin','trainer']);
      let query=client.from('hub_media_assets').select('id,stable_key,version,title,mime_type,file_name,expected_size,status,author_id,reviewed_by,review_reason,source_reference,alt_text,created_at').order('created_at',{ascending:false}).limit(500);
      if(!identity.roles?.includes('ADMIN'))query=query.eq('status','published');
      return {assets:(checked(await query)||[]).map(asset=>({...asset,canReview:identity.roles?.includes('ADMIN')&&asset.author_id!==actorId&&asset.status==='pending_review',canComplete:asset.author_id===actorId&&asset.status==='awaiting_upload'}))};
    },
    async beginUpload(identity,body){
      await actor(identity,['admin']);
      if(!Number.isInteger(body.size)||body.size<1||body.size>25000000)throw new HubError(400,'HUB_VALIDATION_ERROR','Choose a file between 1 byte and 25 MB.');
      const metadata={};for(const key of ['key','title','fileName','mimeType','altText','transcript','source']){if(body[key]!==undefined&&typeof body[key]!=='string')throw new HubError(400,'HUB_VALIDATION_ERROR','Asset descriptions must be text.');metadata[key]=body[key]??'';}metadata.size=body.size;
      const asset=await command(identity,null,'create',metadata,body.idempotencyKey);
      const upload=checked(await client.storage.from(asset.bucket).createSignedUploadUrl(asset.object_path,{upsert:false}));
      return {asset,uploadUrl:upload.signedUrl};
    },
    async transition(identity,id,operation,body){
      await actor(identity,['admin']);workspaceUuid(id);
      if(!['complete','approve','reject','retire'].includes(operation))throw new HubError(400,'HUB_VALIDATION_ERROR','Unknown media action.');
      if(operation!=='complete'&&(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>2000))throw new HubError(400,'HUB_VALIDATION_ERROR','Give a review reason of 5 to 2000 characters.');
      return {asset:await command(identity,id,operation,operation==='complete'?{}:{reason:body.reason.trim()},body.idempotencyKey)};
    },
    async access(identity,id){
      workspaceUuid(id);
      const asset=checked(await client.rpc('hub_media_access',{p_external_subject:identity.subjectId,p_asset_id:id}));
      const signed=checked(await client.storage.from(asset.bucket).createSignedUrl(asset.object_path,900));
      return {asset:{id:asset.id,title:asset.title,version:asset.version,mimeType:asset.mime_type,fileName:asset.file_name,altText:asset.alt_text,transcript:asset.transcript},url:signed.signedUrl,expiresIn:900};
    },
  });
}
