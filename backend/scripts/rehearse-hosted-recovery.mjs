import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {createHubMediaService} from '../src/hub/hubMediaService.js';
import {recoveryManifestSql} from '../../scripts/recovery-manifest.mjs';

// Explicit hosted rehearsal only; never used by CI or the ordinary local gates.
const args=process.argv.slice(2);const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
assert.ok(args.includes('--confirm-rehearsal'),'Pass --confirm-rehearsal for controlled hosted fixture writes.');
const project=option('project');assert.match(project||'',/^[a-z]{20}$/);
const configPath=option('config');assert.ok(configPath&&path.isAbsolute(configPath),'An explicit private config path is required.');
const config=dotenv.parse(fs.readFileSync(configPath));assert.equal(new URL(config.SUPABASE_URL).hostname,`${project}.supabase.co`);
const request=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
const client=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:request}});
const media=createHubMediaService({client});const root=fileURLToPath(new URL('../../',import.meta.url));
const token=randomUUID().replaceAll('-','');const work=path.join(os.tmpdir(),`trez-hub-recovery-${token}`);
const database=`trez_hosted_restore_${token}`;const container='supabase_db_simulador-dos-local';const localArchive=`/tmp/${database}.dump`;
const reportPath=option('report')||path.join(root,'outputs/hub-hosted-recovery.json');
const actorId=randomUUID(),password=randomBytes(32).toString('base64url');let authId,asset,copyBucket,createdDatabase=false,step='initialization';
const report={target:'actual hosted export; isolated local restore; disposable hosted file recovery',project,generatedAt:new Date().toISOString(),checks:[]};
const checked=(result,label)=>{if(result.error)throw new Error(label);return result.data;};
function run(binary,argv,input){const r=spawnSync(binary,argv,{input,encoding:'utf8',windowsHide:true,cwd:root,maxBuffer:32*1024*1024});if(r.status!==0||r.error){fs.writeFileSync(path.join(work,'last-command-error.txt'),r.stderr||'Command failed');throw new Error(`Recovery step failed: ${step}`);}return r.stdout;}
function cli(argv){return run(process.execPath,['node_modules/supabase/dist/supabase.js',...argv]);}
function remote(query){const file=path.join(work,'query.sql');fs.writeFileSync(file,query);return JSON.parse(cli(['db','query','--linked','--project-ref',project,'--file',file])).rows;}
function local(query){return run('docker',['exec','-i',container,'psql','-XAtq','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'],query);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
function assertUnreferenced(){
 if(!asset)return;
 assert.equal(remote(`SELECT EXISTS(SELECT 1 FROM hub_activities WHERE content->'mediaAssetIds' ? ${quote(asset.id)}) OR EXISTS(SELECT 1 FROM hub_content_versions WHERE content#>'{instruction,mediaAssetIds}' ? ${quote(asset.id)}) OR EXISTS(SELECT 1 FROM hub_activity_attempts WHERE definition_snapshot#>'{content,mediaAssetIds}' ? ${quote(asset.id)}) AS referenced;`)[0].referenced,false,'Fixture acquired a reference; preserve its provenance');
}
async function removeOwnedFile(bucket,name){
 // A timed-out DELETE may already have committed. Verify its exact metadata
 // before treating an uncertain response as a cleanup failure.
 const result=await client.storage.from(bucket).remove([name]);
 const exists=remote(`SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=${quote(bucket)} AND name=${quote(name)}) AS exists;`)[0].exists;
 assert.equal(exists,false,result.error?'Storage removal failed':'Storage removal did not take effect');
}
let originalIds=[];
try{
 fs.mkdirSync(work,{mode:0o700});
 if(process.platform==='win32'){const who=run('whoami',[]).trim();run('icacls',[work,'/inheritance:r','/grant:r',`${who}:(OI)(CI)F`]);}
 step='local target validation';assert.equal(run('docker',['inspect','--format','{{.State.Running}}',container]).trim(),'true');
 originalIds=checked(await client.from('hub_identities').select('id'),'Baseline identities').map(row=>row.id);
 step='controlled recovery fixture';
 const auth=checked(await client.auth.admin.createUser({email:`recovery-${token}@auth.trez.invalid`,password,email_confirm:true}),'Fixture Auth creation');authId=auth.user.id;
 checked(await client.from('hub_identities').insert({id:actorId,auth_user_id:authId,external_subject_reference:authId,email:`recovery-${token}@auth.trez.invalid`,username:`R${token.slice(0,12)}`,display_name:'Temporary recovery verification',first_name:'Recovery',surname:token,preferred_locale:'en'}),'Fixture identity');
 const role=checked(await client.from('hub_roles').select('id').eq('code','admin').single(),'Admin role');checked(await client.from('hub_role_assignments').insert({identity_id:actorId,role_id:role.id}),'Fixture role');
 const actor={subjectId:authId,roles:['ADMIN']};const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8pAAAAABJRU5ErkJggg==','base64');
 const registered=await media.beginUpload(actor,{key:`recovery-${token}`,title:'Temporary recovery verification — do not use',fileName:'recovery.png',mimeType:'image/png',size:png.length,altText:'Generated recovery verification pixel',source:'Isolated recovery verification fixture; not curriculum',idempotencyKey:`${token}:upload`});asset=registered.asset;
 assert.ok((await request(registered.uploadUrl,{method:'PUT',headers:{'content-type':'image/png','x-upsert':'false'},body:png})).ok);
 await media.transition(actor,asset.id,'complete',{idempotencyKey:`${token}:complete`});
 const inventory=remote("SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'metadata',metadata) ORDER BY name),'[]') AS files FROM storage.objects WHERE bucket_id='trez-hub-training-assets';")[0].files;
 assert.ok(inventory.length<=1000&&inventory.reduce((sum,f)=>sum+Number(f.metadata?.size||0),0)<=50000000,'Use a larger approved backup target for this file inventory.');
 const files=[];for(const item of inventory){const blob=checked(await client.storage.from(asset.bucket).download(item.name),'Backup private file');const bytes=Buffer.from(await blob.arrayBuffer());files.push({name:item.name,mime:item.metadata.mimetype,sha256:hash(bytes),bytes:bytes.toString('base64')});}
 step='hosted consistent export';
 const manifest=remote(`BEGIN;${recoveryManifestSql()}ROLLBACK;`)[0].jsonb_build_object;
 const schemaFile=path.join(work,'schema.sql'),dataFile=path.join(work,'data.sql');
 const schemas='public,auth,storage,supabase_migrations';
 cli(['db','dump','--linked','--project-ref',project,'--schema',schemas,'--keep-comments','--file',schemaFile]);
 cli(['db','dump','--linked','--project-ref',project,'--schema',schemas,'--data-only','--use-copy','--file',dataFile]);
 // The provider CLI intentionally excludes its Auth/Storage migration ledgers
 // from data dumps. Preserve them explicitly instead of ignoring a hash mismatch.
 const managedLedgers=remote("SELECT (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM auth.schema_migrations t) AS auth,(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM storage.migrations t) AS storage;")[0];
 const afterExport=remote(`BEGIN;${recoveryManifestSql()}ROLLBACK;`)[0].jsonb_build_object;assert.deepEqual(afterExport,manifest,'Source changed during export; repeat in a quiet window.');
 const payload={schema:fs.readFileSync(schemaFile,'utf8'),data:fs.readFileSync(dataFile,'utf8'),managedLedgers,manifest,files};
 const key=randomBytes(32),iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
 const sealed=path.join(work,'backup.aesgcm');fs.writeFileSync(sealed,Buffer.concat([iv,cipher.getAuthTag(),encrypted]));fs.unlinkSync(schemaFile);fs.unlinkSync(dataFile);
 const archived=fs.readFileSync(sealed);const decipher=createDecipheriv('aes-256-gcm',key,archived.subarray(0,12));decipher.setAuthTag(archived.subarray(12,28));const recovered=JSON.parse(Buffer.concat([decipher.update(archived.subarray(28)),decipher.final()]).toString());key.fill(0);
 report.checks.push('Actual hosted public/Auth/Storage/migration-ledger export and file bytes sealed/decrypted with AES-256-GCM; source stayed stable during export');
 step='isolated database creation';
 run('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','-Fc','-f',localArchive]);
 run('docker',['exec',container,'createdb','-U','supabase_admin','--template=template0',database]);createdDatabase=true;
 run('docker',['exec',container,'pg_restore','-U','supabase_admin','-d',database,'--exit-on-error',localArchive]);
 step='hosted schema restore';local('DROP SCHEMA public,auth,storage,supabase_migrations CASCADE;\n'+recovered.schema);
 step='hosted data restore';local('SET session_replication_role=replica;\n'+recovered.data+'\nSET session_replication_role=origin;');
 local(`INSERT INTO auth.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::auth.schema_migrations,${quote(JSON.stringify(recovered.managedLedgers.auth))}::jsonb);INSERT INTO storage.migrations SELECT * FROM jsonb_populate_recordset(NULL::storage.migrations,${quote(JSON.stringify(recovered.managedLedgers.storage))}::jsonb);`);
 step='restored manifest comparison';
 const restoredManifest=JSON.parse(local(`BEGIN;${recoveryManifestSql()}ROLLBACK;`));
 report.manifestDifferences=Object.keys(recovered.manifest).filter(key=>!isDeepStrictEqual(restoredManifest[key],recovered.manifest[key])).map(key=>({section:key,changedEntries:Array.isArray(recovered.manifest[key])?recovered.manifest[key].filter(entry=>!restoredManifest[key]?.some(other=>isDeepStrictEqual(entry,other))).slice(0,10):['definition']}));
 assert.deepEqual(restoredManifest,recovered.manifest,'Recovered data/security/schema differ from hosted backup');
 step='recovered foreign keys and identity';
 local(`DO $$ DECLARE r RECORD;BEGIN FOR r IN SELECT c.oid,c.conrelid::regclass t,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname='public' LOOP
 EXECUTE format('ALTER TABLE %s ADD CONSTRAINT trez_recovery_fk %s NOT VALID',r.t,regexp_replace(r.definition,' NOT VALID$',''));
 EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT trez_recovery_fk',r.t);EXECUTE format('ALTER TABLE %s DROP CONSTRAINT trez_recovery_fk',r.t);END LOOP;END $$;`);
 assert.equal(local(`SELECT encrypted_password=extensions.crypt(${quote(password)},encrypted_password) FROM auth.users WHERE id=${quote(authId)};`).trim(),'t');
 assert.equal(local(`SELECT public.hub_require_active_role(${quote(authId)},ARRAY['admin'])=${quote(actorId)}::uuid;`).trim(),'t');
 report.tables=manifest.tables.length;report.checks.push('Actual hosted database restored into a separate local database; table hashes, schema, RLS, grants, all public FKs and recovered Auth credential/identity checks passed');
 step='private file copy recovery';
 copyBucket=`trez-recovery-${token}`;checked(await client.storage.createBucket(copyBucket,{public:false,fileSizeLimit:25000000,allowedMimeTypes:['image/png','image/jpeg','application/pdf','video/mp4','video/webm']}),'Create isolated private recovery bucket');
 for(const file of recovered.files){checked(await client.storage.from(copyBucket).upload(file.name,Buffer.from(file.bytes,'base64'),{contentType:file.mime,upsert:false}),'Restore private copy');const restored=checked(await client.storage.from(copyBucket).download(file.name),'Read restored copy');assert.equal(hash(Buffer.from(await restored.arrayBuffer())),file.sha256);assert.equal((await request(client.storage.from(copyBucket).getPublicUrl(file.name).data.publicUrl)).ok,false);}
 step='exact disposable file restoration';
 assertUnreferenced();
 await removeOwnedFile(asset.bucket,asset.object_path);
 step='verify fixture absence';assert.ok((await client.storage.from(asset.bucket).download(asset.object_path)).error,'Fixture deletion did not take effect');
 step='restore fixture bytes';
 const owned=recovered.files.find(file=>file.name===asset.object_path);assert.ok(owned);checked(await client.storage.from(asset.bucket).upload(owned.name,Buffer.from(owned.bytes,'base64'),{contentType:owned.mime,upsert:false}),'Restore exact fixture path');
 step='Hub signed restored download';const access=await media.access(actor,asset.id);const download=await request(access.url);assert.ok(download.ok,`Restored signed download returned ${download.status}`);assert.equal(hash(Buffer.from(await download.arrayBuffer())),owned.sha256);
 // Storage regenerates object/version metadata. Reconcile the restored copy's
 // fixture row to those new identifiers; ordinary Hub references use bucket/path.
 step='local Storage metadata reconciliation';const currentObject=remote(`SELECT to_jsonb(o) AS object FROM storage.objects o WHERE bucket_id=${quote(asset.bucket)} AND name=${quote(asset.object_path)};`)[0].object;
 local(`BEGIN;SET LOCAL session_replication_role=replica;DELETE FROM storage.objects WHERE bucket_id=${quote(asset.bucket)} AND name=${quote(asset.object_path)};
 DO $$ DECLARE columns TEXT;BEGIN SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
 EXECUTE format('INSERT INTO storage.objects(%s) SELECT %s FROM jsonb_populate_record(NULL::storage.objects,$1)',columns,columns) USING ${quote(JSON.stringify(currentObject))}::jsonb;END $$;COMMIT;`);
 assert.equal(local(`SELECT EXISTS(SELECT 1 FROM public.hub_media_assets a JOIN storage.objects o ON o.bucket_id=a.bucket AND o.name=a.object_path WHERE a.id=${quote(asset.id)} AND (o.metadata->>'size')::bigint=a.expected_size AND o.metadata->>'mimetype'=a.mime_type);`).trim(),'t');
 report.files=recovered.files.length;report.checks.push('All archived app files restored to an isolated private hosted bucket with matching hashes and public denial; exact owned source fixture deletion/restoration and Hub-signed download passed, with Storage version reconciliation');report.passed=true;
}catch(error){report.passed=false;report.failedStep=step;report.failure=error.message.includes('Source changed')?'Source changed during export':`Step failed: ${step}`;process.exitCode=1;
 report.errorType=error.name;report.errorCode=error.code||null;
 if(['verify fixture absence','restore fixture bytes','Hub signed restored download','exact disposable file restoration'].includes(step))report.detail=error.message.split('\n')[0].slice(0,200);
 const diagnostics=path.join(work,'last-command-error.txt');
 if(fs.existsSync(diagnostics)){const safe=fs.readFileSync(diagnostics,'utf8').split(/\r?\n/).find(line=>/ERROR:/.test(line));if(safe)report.diagnostic=safe.split('DETAIL:')[0].slice(0,300);}
 console.error(JSON.stringify(report));}
finally{
 const errors=[];
 try{if(copyBucket){const rows=await client.storage.from(copyBucket).list('',{limit:1000}); // Paths are known from the source inventory; recursively enumerating is unnecessary.
   const paths=remote(`SELECT name FROM storage.objects WHERE bucket_id=${quote(copyBucket)};`).map(row=>row.name);if(paths.length)checked(await client.storage.from(copyBucket).remove(paths),'Remove recovery copies');checked(await client.storage.deleteBucket(copyBucket),'Remove recovery bucket');void rows;}}
 catch{errors.push('Recovery bucket cleanup');}
 let removedIdentity=false;
 try{assertUnreferenced();if(asset)await removeOwnedFile(asset.bucket,asset.object_path);
  if(authId){remote(`BEGIN;DO $$ BEGIN IF EXISTS(SELECT 1 FROM hub_activities WHERE content->'mediaAssetIds' ? ${quote(asset?.id||'')}) OR EXISTS(SELECT 1 FROM hub_content_versions WHERE content#>'{instruction,mediaAssetIds}' ? ${quote(asset?.id||'')}) OR EXISTS(SELECT 1 FROM hub_activity_attempts WHERE definition_snapshot#>'{content,mediaAssetIds}' ? ${quote(asset?.id||'')}) THEN RAISE EXCEPTION 'Fixture acquired a reference; preserve its provenance';END IF;END $$;
SET LOCAL session_replication_role=replica;DELETE FROM hub_media_cleanup_events WHERE asset_id=${quote(asset?.id||'00000000-0000-4000-8000-000000000000')};DELETE FROM hub_media_cleanup_jobs WHERE asset_id=${quote(asset?.id||'00000000-0000-4000-8000-000000000000')};DELETE FROM hub_media_review_events WHERE asset_id=${quote(asset?.id||'00000000-0000-4000-8000-000000000000')};DELETE FROM hub_media_assets WHERE author_id=${quote(actorId)};DELETE FROM hub_idempotency_keys WHERE identity_id=${quote(actorId)};DELETE FROM hub_role_assignments WHERE identity_id=${quote(actorId)};DELETE FROM hub_identities WHERE id=${quote(actorId)} AND auth_user_id=${quote(authId)};COMMIT;`);removedIdentity=true;checked(await client.auth.admin.deleteUser(authId),'Remove fixture Auth');}
 }catch{errors.push('Fixture metadata/Auth cleanup');if(authId&&!removedIdentity){await client.auth.admin.updateUserById(authId,{ban_duration:'876000h'});await client.from('hub_identities').update({status:'deactivated',deactivated_at:new Date().toISOString()}).eq('id',actorId);}}
 try{assert.match(database,/^trez_hosted_restore_[a-f0-9]{32}$/);if(createdDatabase)run('docker',['exec',container,'dropdb','-U','supabase_admin',database]);run('docker',['exec',container,'rm','-f','--',localArchive]);}catch{errors.push('Local database/archive cleanup');}
 try{const now=remote('SELECT id FROM public.hub_identities;').map(row=>row.id);assert.ok(originalIds.every(id=>now.includes(id)));assert.ok(!now.includes(actorId));report.originalIdentitiesPreserved=originalIds.length;}catch{errors.push('Identity preservation check');}
 report.cleanupPassed=errors.length===0;if(errors.length){report.cleanupFailures=errors;process.exitCode=1;}
 // Exact task-owned temporary directory only; never delete a computed ancestor.
 assert.equal(path.dirname(path.resolve(work)),path.resolve(os.tmpdir()));assert.equal(path.basename(work),`trez-hub-recovery-${token}`);
 if(fs.existsSync(work))fs.rmSync(work,{recursive:true,force:true});
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
