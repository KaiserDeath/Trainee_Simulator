INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('trez-hub-training-assets','trez-hub-training-assets',FALSE,25000000,ARRAY['image/png','image/jpeg','application/pdf','video/mp4','video/webm'])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='trez-hub-training-assets' AND public) THEN RAISE EXCEPTION 'HUB_MEDIA_BUCKET_MUST_BE_PRIVATE';END IF;END;$$;
CREATE TABLE public.hub_media_assets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),stable_key TEXT NOT NULL,version INTEGER NOT NULL,title TEXT NOT NULL,
 bucket TEXT NOT NULL DEFAULT 'trez-hub-training-assets' CHECK(bucket='trez-hub-training-assets'),object_path TEXT NOT NULL UNIQUE,
 file_name TEXT NOT NULL,mime_type TEXT NOT NULL,expected_size BIGINT NOT NULL CHECK(expected_size BETWEEN 1 AND 25000000),
 alt_text TEXT NOT NULL DEFAULT '',transcript TEXT NOT NULL DEFAULT '',source_reference TEXT NOT NULL,
 author_id UUID NOT NULL REFERENCES public.hub_identities(id),status TEXT NOT NULL DEFAULT 'awaiting_upload' CHECK(status IN ('awaiting_upload','pending_review','published','rejected','retired')),
 reviewed_by UUID REFERENCES public.hub_identities(id),review_reason TEXT,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(stable_key,version)
);
CREATE TABLE public.hub_media_review_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),asset_id UUID NOT NULL REFERENCES public.hub_media_assets(id),actor_id UUID NOT NULL REFERENCES public.hub_identities(id),
 decision TEXT NOT NULL,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER hub_media_reviews_immutable BEFORE UPDATE OR DELETE ON public.hub_media_review_events FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE FUNCTION public.hub_guard_media_asset() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 IF to_jsonb(NEW)-ARRAY['status','reviewed_by','review_reason','reviewed_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','reviewed_by','review_reason','reviewed_at'] THEN RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';END IF;
 IF NOT(OLD.status='awaiting_upload' AND NEW.status='pending_review' OR OLD.status='pending_review' AND NEW.status IN ('published','rejected') OR OLD.status='published' AND NEW.status='retired') THEN RAISE EXCEPTION 'HUB_MEDIA_STATE_CONFLICT';END IF;
 IF NEW.status IN ('published','rejected') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.author_id OR length(btrim(coalesce(NEW.review_reason,'')))<5) THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_media_asset_guard BEFORE UPDATE OR DELETE ON public.hub_media_assets FOR EACH ROW EXECUTE FUNCTION public.hub_guard_media_asset();

CREATE FUNCTION public.hub_media_command(p_external_subject TEXT,p_command TEXT,p_asset_id UUID,p_metadata JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;asset public.hub_media_assets%ROWTYPE;claim public.hub_idempotency_keys%ROWTYPE;fingerprint TEXT;next_version INTEGER;
 asset_id UUID;extension TEXT;object_metadata JSONB;reason TEXT;result JSONB;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['admin']);
 IF p_command IS NULL OR p_command NOT IN ('create','complete','approve','reject','retire') OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' OR length(coalesce(p_idempotency_key,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('command',p_command,'asset',p_asset_id,'metadata',p_metadata)::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(actor,'media_asset',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=actor AND action_code='media_asset' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
 IF p_command='create' THEN
   IF coalesce(p_metadata->>'key','')!~'^[a-z][a-z0-9-]{2,99}$' OR length(btrim(coalesce(p_metadata->>'title',''))) NOT BETWEEN 1 AND 200
     OR length(coalesce(p_metadata->>'fileName','')) NOT BETWEEN 1 AND 200 OR p_metadata->>'fileName'~'[[:cntrl:]]' OR position('/' in p_metadata->>'fileName')>0 OR position(chr(92) in p_metadata->>'fileName')>0
     OR coalesce(p_metadata->>'size','')!~'^[0-9]{1,8}$' OR coalesce(p_metadata->>'mimeType','') NOT IN ('image/png','image/jpeg','application/pdf','video/mp4','video/webm')
     OR length(btrim(coalesce(p_metadata->>'source',''))) NOT BETWEEN 5 AND 2000 OR length(coalesce(p_metadata->>'altText',''))>2000 OR length(coalesce(p_metadata->>'transcript',''))>50000 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
   IF (p_metadata->>'size')::bigint NOT BETWEEN 1 AND 25000000 OR (p_metadata->>'mimeType' LIKE 'image/%' AND length(btrim(coalesce(p_metadata->>'altText','')))=0)
     OR (p_metadata->>'mimeType' LIKE 'video/%' AND length(btrim(coalesce(p_metadata->>'transcript','')))<10) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('hub-media:'||(p_metadata->>'key'),0));
   SELECT coalesce(max(version),0)+1 INTO next_version FROM public.hub_media_assets WHERE stable_key=p_metadata->>'key';
   asset_id:=gen_random_uuid();extension:=CASE p_metadata->>'mimeType' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'application/pdf' THEN 'pdf' WHEN 'video/mp4' THEN 'mp4' ELSE 'webm' END;
   INSERT INTO public.hub_media_assets(id,stable_key,version,title,object_path,file_name,mime_type,expected_size,alt_text,transcript,source_reference,author_id)
   VALUES(asset_id,p_metadata->>'key',next_version,btrim(p_metadata->>'title'),asset_id::text||'/asset.'||extension,p_metadata->>'fileName',p_metadata->>'mimeType',(p_metadata->>'size')::bigint,
     coalesce(p_metadata->>'altText',''),coalesce(p_metadata->>'transcript',''),btrim(p_metadata->>'source'),actor) RETURNING * INTO asset;
 ELSE
   SELECT * INTO asset FROM public.hub_media_assets WHERE id=p_asset_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   IF p_command='complete' THEN
     IF asset.author_id<>actor THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
     IF asset.status='awaiting_upload' THEN
       SELECT metadata INTO object_metadata FROM storage.objects WHERE bucket_id=asset.bucket AND name=asset.object_path;
       IF object_metadata IS NULL OR coalesce(object_metadata->>'mimetype','')<>asset.mime_type OR coalesce((object_metadata->>'size')::bigint,0)<>asset.expected_size THEN RAISE EXCEPTION 'HUB_MEDIA_UPLOAD_INCOMPLETE';END IF;
       UPDATE public.hub_media_assets SET status='pending_review' WHERE id=asset.id RETURNING * INTO asset;
     END IF;
   ELSE
     reason:=btrim(coalesce(p_metadata->>'reason',''));
     IF length(reason) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
     IF p_command IN ('approve','reject') AND asset.author_id=actor THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED';END IF;
     IF p_command IN ('approve','reject') AND asset.status<>'pending_review' OR p_command='retire' AND asset.status<>'published' THEN RAISE EXCEPTION 'HUB_MEDIA_STATE_CONFLICT';END IF;
     UPDATE public.hub_media_assets SET status=CASE p_command WHEN 'approve' THEN 'published' WHEN 'reject' THEN 'rejected' ELSE 'retired' END,reviewed_by=actor,review_reason=reason,reviewed_at=clock_timestamp() WHERE id=asset.id RETURNING * INTO asset;
     INSERT INTO public.hub_media_review_events(asset_id,actor_id,decision,reason) VALUES(asset.id,actor,p_command,reason);
   END IF;
 END IF;
 result:=to_jsonb(asset);
 UPDATE public.hub_idempotency_keys SET response=result WHERE identity_id=actor AND action_code='media_asset' AND idempotency_key=p_idempotency_key;
 RETURN result;
END; $$;

CREATE FUNCTION public.hub_media_access(p_external_subject TEXT,p_asset_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;asset public.hub_media_assets%ROWTYPE;role TEXT;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['admin','trainer','rrhh','postulante']);
 SELECT r.code INTO role FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=actor;
 SELECT * INTO asset FROM public.hub_media_assets WHERE id=p_asset_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 IF role='admin' OR role IN ('trainer','rrhh') AND asset.status IN ('published','retired') THEN RETURN to_jsonb(asset);END IF;
 IF role='postulante' AND asset.status IN ('published','retired') AND (
   asset.status='published' AND EXISTS(SELECT 1 FROM public.hub_activities a JOIN public.hub_modules m ON m.id=a.module_id JOIN public.hub_enrolments e ON e.course_id=m.course_id
     WHERE e.identity_id=actor AND e.status<>'withdrawn' AND a.content->'mediaAssetIds' ? asset.id::text AND a.publication_status<>'archived'
       AND NOT EXISTS(SELECT 1 FROM public.hub_module_prerequisites dependency WHERE dependency.module_id=m.id AND NOT EXISTS(
         SELECT 1 FROM public.hub_module_progress p WHERE p.enrolment_id=e.id AND p.module_id=dependency.prerequisite_module_id AND p.status='completed')))
   OR EXISTS(SELECT 1 FROM public.hub_activity_attempts aa JOIN public.hub_attempts a ON a.id=aa.attempt_id JOIN public.hub_module_progress p ON p.id=a.module_progress_id
     JOIN public.hub_enrolments e ON e.id=p.enrolment_id WHERE e.identity_id=actor AND e.status<>'withdrawn' AND aa.started_at>=now()-interval '2 years' AND aa.definition_snapshot#>'{content,mediaAssetIds}' ? asset.id::text)
 ) THEN RETURN to_jsonb(asset);END IF;
 RAISE EXCEPTION 'HUB_ACCESS_DENIED';
END; $$;
ALTER TABLE public.hub_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_media_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_media_assets,public.hub_media_review_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hub_media_assets,public.hub_media_review_events TO service_role;
REVOKE ALL ON FUNCTION public.hub_guard_media_asset(),public.hub_media_command(TEXT,TEXT,UUID,JSONB,TEXT),public.hub_media_access(TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_media_command(TEXT,TEXT,UUID,JSONB,TEXT),public.hub_media_access(TEXT,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.hub_validate_instruction_version() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND
    (NEW.content IS DISTINCT FROM OLD.content OR NEW.definition_id <> OLD.definition_id
     OR NEW.definition_kind <> OLD.definition_kind OR NEW.locale <> OLD.locale
     OR NEW.author_identity_id <> OLD.author_identity_id OR NEW.version_number <> OLD.version_number
     OR NEW.change_rationale <> OLD.change_rationale) THEN
    RAISE EXCEPTION 'HUB_PUBLISHED_CONTENT_IMMUTABLE';
  END IF;
  IF NEW.content ? 'instruction' THEN
    IF NEW.definition_kind <> 'activity' OR NEW.locale <> 'en'
       OR jsonb_typeof(NEW.content->'instruction') <> 'object'
       OR NEW.content->>'title' IS NULL OR length(btrim(NEW.content->>'title')) NOT BETWEEN 1 AND 200
       OR octet_length(NEW.content::text) > 65536
       OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.content->'instruction') k
         WHERE k NOT IN ('summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','mediaAssetIds')) THEN
      RAISE EXCEPTION 'HUB_INVALID_INSTRUCTION';
    END IF;
  END IF;
  IF NEW.content#>'{instruction,mediaAssetIds}' IS NOT NULL THEN
    IF jsonb_typeof(NEW.content#>'{instruction,mediaAssetIds}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'HUB_INVALID_INSTRUCTION';END IF;
    IF jsonb_array_length(NEW.content#>'{instruction,mediaAssetIds}')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.content#>'{instruction,mediaAssetIds}') item WHERE jsonb_typeof(item)<>'string' OR (item#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'HUB_INVALID_INSTRUCTION';END IF;
    IF NEW.status='published' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.content#>'{instruction,mediaAssetIds}') asset_id WHERE NOT EXISTS(SELECT 1 FROM public.hub_media_assets asset WHERE asset.id=asset_id::uuid AND asset.status='published')) THEN RAISE EXCEPTION 'HUB_MEDIA_NOT_PUBLISHED';END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.hub_apply_published_instruction() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status <> 'published' AND NEW.content ? 'instruction' THEN
    UPDATE public.hub_activities SET title = NEW.content->>'title',
      content = (content - ARRAY['summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','mediaAssetIds']) || (NEW.content->'instruction'),
      updated_at = now() WHERE id = NEW.definition_id;
  END IF;
  RETURN NEW;
END; $$;
