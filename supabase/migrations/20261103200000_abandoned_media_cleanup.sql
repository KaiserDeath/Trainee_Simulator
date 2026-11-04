-- Expire only abandoned registrations. Published/rejected/retired media and
-- every lesson/version/snapshot reference remain outside physical cleanup.
ALTER TABLE public.hub_media_assets DROP CONSTRAINT hub_media_assets_status_check;
ALTER TABLE public.hub_media_assets ADD CONSTRAINT hub_media_assets_status_check
 CHECK(status IN('awaiting_upload','pending_review','published','rejected','retired','expired'));
ALTER TABLE public.hub_media_assets ADD COLUMN upload_valid_until TIMESTAMPTZ;
-- Protect signed links issued before this migration (Storage upload TTL: 2h).
-- Backfill below after replacing the immutable-asset guard.
CREATE OR REPLACE FUNCTION public.hub_guard_media_asset() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 IF to_jsonb(NEW)-ARRAY['status','reviewed_by','review_reason','reviewed_at','upload_valid_until'] IS DISTINCT FROM
    to_jsonb(OLD)-ARRAY['status','reviewed_by','review_reason','reviewed_at','upload_valid_until'] THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 IF NEW.upload_valid_until IS DISTINCT FROM OLD.upload_valid_until THEN
   IF OLD.status<>'awaiting_upload' OR NEW.status<>OLD.status OR NEW.upload_valid_until IS NULL
      OR NEW.upload_valid_until<coalesce(OLD.upload_valid_until,'-infinity'::timestamptz)
      OR NEW.upload_valid_until>clock_timestamp()+interval '3 hours 1 minute'
      OR (to_jsonb(NEW)-'upload_valid_until') IS DISTINCT FROM (to_jsonb(OLD)-'upload_valid_until') THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
   RETURN NEW;
 END IF;
 IF NOT(OLD.status='awaiting_upload' AND NEW.status IN('pending_review','expired') OR
   OLD.status='pending_review' AND NEW.status IN('published','rejected') OR OLD.status='published' AND NEW.status='retired') THEN RAISE EXCEPTION 'HUB_MEDIA_STATE_CONFLICT';END IF;
 IF NEW.status='expired' AND (OLD.created_at>clock_timestamp()-interval '72 hours' OR OLD.upload_valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'HUB_MEDIA_STATE_CONFLICT';END IF;
 IF NEW.status IN('published','rejected') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.author_id OR length(btrim(coalesce(NEW.review_reason,'')))<5) THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED';END IF;
 RETURN NEW;
END; $$;
UPDATE public.hub_media_assets SET upload_valid_until=clock_timestamp()+interval '3 hours' WHERE status='awaiting_upload';

CREATE TABLE public.hub_media_cleanup_jobs(
 asset_id UUID PRIMARY KEY REFERENCES public.hub_media_assets(id),claim_token UUID NOT NULL,
 lease_until TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts>0),
 completed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 last_failure_code TEXT CHECK(last_failure_code='storage_unavailable')
);
CREATE TABLE public.hub_media_cleanup_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),asset_id UUID NOT NULL REFERENCES public.hub_media_assets(id),
 event TEXT NOT NULL CHECK(event IN('claimed','removed','retry')),attempt INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER hub_media_cleanup_events_immutable BEFORE UPDATE OR DELETE ON public.hub_media_cleanup_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE FUNCTION public.hub_media_upload_grant(p_external_subject TEXT,p_asset_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;asset public.hub_media_assets%ROWTYPE;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['admin']);
 SELECT * INTO asset FROM public.hub_media_assets WHERE id=p_asset_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 IF actor<>asset.author_id THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 IF asset.status='expired' THEN RAISE EXCEPTION 'HUB_MEDIA_UPLOAD_EXPIRED';END IF;
 IF asset.status<>'awaiting_upload' THEN RETURN to_jsonb(asset);END IF;
 IF asset.created_at<=clock_timestamp()-interval '72 hours' THEN RAISE EXCEPTION 'HUB_MEDIA_UPLOAD_EXPIRED';END IF;
 UPDATE public.hub_media_assets SET upload_valid_until=greatest(coalesce(upload_valid_until,'-infinity'),clock_timestamp()+interval '3 hours') WHERE id=asset.id RETURNING * INTO asset;
 RETURN to_jsonb(asset);
END; $$;

-- Cached create/complete replies never revive an expired registration.
ALTER FUNCTION public.hub_media_command(TEXT,TEXT,UUID,JSONB,TEXT) RENAME TO hub_media_command_original;
REVOKE ALL ON FUNCTION public.hub_media_command_original(TEXT,TEXT,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hub_media_command(p_external_subject TEXT,p_command TEXT,p_asset_id UUID,p_metadata JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.hub_require_active_role(p_external_subject,ARRAY['admin']);
 IF p_asset_id IS NOT NULL THEN
   PERFORM 1 FROM public.hub_media_assets WHERE id=p_asset_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.hub_media_assets WHERE id=p_asset_id AND status='expired') THEN RAISE EXCEPTION 'HUB_MEDIA_UPLOAD_EXPIRED';END IF;
 END IF;
 RETURN public.hub_media_command_original(p_external_subject,p_command,p_asset_id,p_metadata,p_idempotency_key);
END; $$;

CREATE FUNCTION public.hub_media_reference_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE refs JSONB;
BEGIN
 refs:=CASE TG_TABLE_NAME WHEN 'hub_content_versions' THEN to_jsonb(NEW)#>'{content,instruction,mediaAssetIds}'
   WHEN 'hub_activities' THEN to_jsonb(NEW)#>'{content,mediaAssetIds}'
   ELSE to_jsonb(NEW)#>'{definition_snapshot,content,mediaAssetIds}' END;
 IF jsonb_typeof(refs)='array' THEN
   -- Serialize new references against cleanup's row lock, then check fresh state.
   PERFORM 1 FROM public.hub_media_assets WHERE id::text IN(SELECT jsonb_array_elements_text(refs)) FOR SHARE;
   IF EXISTS(SELECT 1 FROM public.hub_media_assets WHERE status='expired' AND id::text IN(SELECT jsonb_array_elements_text(refs))) THEN RAISE EXCEPTION 'HUB_MEDIA_UPLOAD_EXPIRED';END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_media_reference_guard BEFORE INSERT OR UPDATE ON public.hub_content_versions FOR EACH ROW EXECUTE FUNCTION public.hub_media_reference_guard();
CREATE TRIGGER hub_media_reference_guard BEFORE INSERT OR UPDATE ON public.hub_activities FOR EACH ROW EXECUTE FUNCTION public.hub_media_reference_guard();
CREATE TRIGGER hub_media_reference_guard BEFORE INSERT OR UPDATE ON public.hub_activity_attempts FOR EACH ROW EXECUTE FUNCTION public.hub_media_reference_guard();

CREATE FUNCTION public.hub_media_cleanup_candidates() RETURNS SETOF public.hub_media_assets
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a.* FROM public.hub_media_assets a LEFT JOIN public.hub_media_cleanup_jobs j ON j.asset_id=a.id
 WHERE ((a.status='awaiting_upload' AND a.created_at<=now()-interval '72 hours' AND coalesce(a.upload_valid_until,'-infinity')<=now())
   OR (a.status='expired' AND j.completed_at IS NULL AND j.lease_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM public.hub_activities x WHERE x.content->'mediaAssetIds' ? a.id::text)
 AND NOT EXISTS(SELECT 1 FROM public.hub_content_versions x WHERE x.content#>'{instruction,mediaAssetIds}' ? a.id::text)
 AND NOT EXISTS(SELECT 1 FROM public.hub_activity_attempts x WHERE x.definition_snapshot#>'{content,mediaAssetIds}' ? a.id::text)
 ORDER BY a.created_at,a.id;
$$;

CREATE FUNCTION public.hub_media_cleanup(p_mode TEXT,p_limit INTEGER DEFAULT 100,p_asset_id UUID DEFAULT NULL,p_claim_token UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.hub_media_assets%ROWTYPE;j public.hub_media_cleanup_jobs%ROWTYPE;result JSONB:='[]';
BEGIN
 IF p_mode NOT IN('preview','claim','complete','retry') OR p_mode IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 IF p_mode='preview' THEN
   RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',id,'status',status,'bucket',bucket,'objectPath',object_path)),'[]') FROM (SELECT * FROM public.hub_media_cleanup_candidates() LIMIT p_limit)x);
 ELSIF p_mode='claim' THEN
   FOR a IN SELECT x.* FROM public.hub_media_assets x WHERE x.id IN(SELECT id FROM public.hub_media_cleanup_candidates()) ORDER BY x.created_at,x.id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
     IF NOT EXISTS(SELECT 1 FROM public.hub_media_cleanup_candidates() WHERE id=a.id) THEN CONTINUE;END IF;
     IF a.status='awaiting_upload' THEN UPDATE public.hub_media_assets SET status='expired' WHERE id=a.id;END IF;
     INSERT INTO public.hub_media_cleanup_jobs(asset_id,claim_token,lease_until) VALUES(a.id,gen_random_uuid(),clock_timestamp()+interval '5 minutes')
     ON CONFLICT(asset_id) DO UPDATE SET claim_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=hub_media_cleanup_jobs.attempts+1,last_failure_code=NULL
     RETURNING * INTO j;
     INSERT INTO public.hub_media_cleanup_events(asset_id,event,attempt) VALUES(a.id,'claimed',j.attempts);
     result:=result||jsonb_build_array(jsonb_build_object('assetId',a.id,'bucket',a.bucket,'objectPath',a.object_path,'claimToken',j.claim_token));
   END LOOP;
   RETURN result;
 ELSE
   SELECT * INTO j FROM public.hub_media_cleanup_jobs WHERE asset_id=p_asset_id FOR UPDATE;
   IF NOT FOUND OR j.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'HUB_MEDIA_CLEANUP_CONFLICT';END IF;
   IF j.completed_at IS NOT NULL THEN RETURN jsonb_build_object('completed',TRUE);END IF;
   IF p_mode='complete' THEN UPDATE public.hub_media_cleanup_jobs SET completed_at=clock_timestamp(),last_failure_code=NULL WHERE asset_id=j.asset_id;
   ELSE UPDATE public.hub_media_cleanup_jobs SET lease_until=clock_timestamp()+interval '5 minutes',last_failure_code='storage_unavailable' WHERE asset_id=j.asset_id;END IF;
   INSERT INTO public.hub_media_cleanup_events(asset_id,event,attempt) VALUES(j.asset_id,CASE p_mode WHEN 'complete' THEN 'removed' ELSE 'retry' END,j.attempts);
   RETURN jsonb_build_object('completed',p_mode='complete');
 END IF;
END; $$;
ALTER TABLE public.hub_media_cleanup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_media_cleanup_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_media_cleanup_jobs,public.hub_media_cleanup_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hub_media_cleanup_jobs,public.hub_media_cleanup_events TO service_role;
REVOKE ALL ON FUNCTION public.hub_media_upload_grant(TEXT,UUID),public.hub_media_command(TEXT,TEXT,UUID,JSONB,TEXT),public.hub_media_reference_guard(),public.hub_media_cleanup_candidates(),public.hub_media_cleanup(TEXT,INTEGER,UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hub_media_cleanup_candidates() FROM service_role;
GRANT EXECUTE ON FUNCTION public.hub_media_upload_grant(TEXT,UUID),public.hub_media_command(TEXT,TEXT,UUID,JSONB,TEXT),public.hub_media_cleanup(TEXT,INTEGER,UUID,UUID) TO service_role;
