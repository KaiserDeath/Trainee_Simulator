-- Display translations are versioned instructional data, never operational rules.
CREATE FUNCTION public.hub_instruction_texts(p_value JSONB,p_allowed BOOLEAN DEFAULT FALSE) RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE v_texts TEXT[]:='{}';v_entry RECORD;v_value JSONB;
BEGIN
 CASE jsonb_typeof(p_value)
 WHEN 'object' THEN
  FOR v_entry IN SELECT key,value FROM jsonb_each(p_value) LOOP
   v_texts:=v_texts||public.hub_instruction_texts(v_entry.value,v_entry.key=ANY(ARRAY[
    'title','summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','label','text']));
  END LOOP;
 WHEN 'array' THEN
  FOR v_value IN SELECT value FROM jsonb_array_elements(p_value) LOOP v_texts:=v_texts||public.hub_instruction_texts(v_value,p_allowed);END LOOP;
 WHEN 'string' THEN
  IF p_allowed AND length(btrim(p_value#>>'{}'))>0 THEN v_texts:=ARRAY[p_value#>>'{}'];END IF;
 ELSE NULL;
 END CASE;
 RETURN ARRAY(SELECT DISTINCT value FROM unnest(v_texts) value ORDER BY value);
END;$$;
CREATE FUNCTION public.hub_instruction_source_hash(p_content JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(extensions.digest(p_content::text,'sha256'),'hex');
$$;

CREATE OR REPLACE FUNCTION public.hub_validate_bilingual_content() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_source public.hub_content_versions%ROWTYPE;v_data JSONB;v_texts TEXT[];v_source_id UUID;
BEGIN
 IF NEW.definition_kind='activity' AND NEW.locale='es' AND NEW.content?'displayTranslation'
  AND (TG_OP='INSERT' OR NEW.status NOT IN('archived','rejected')) THEN
  v_data:=NEW.content->'displayTranslation';
  BEGIN v_source_id:=(v_data->>'sourceVersionId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HUB_TRANSLATION_INVALID';END;
  SELECT * INTO v_source FROM public.hub_content_versions WHERE id=v_source_id AND locale='en'
   AND definition_kind='activity' AND definition_id=NEW.definition_id AND content?'instruction' AND status<>'rejected';
  IF v_source.id IS NULL OR jsonb_typeof(v_data) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.content) k WHERE k<>'displayTranslation')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_data) k WHERE k NOT IN('sourceVersionId','sourceFingerprint','es'))
   OR v_data->>'sourceFingerprint' IS DISTINCT FROM public.hub_instruction_source_hash(v_source.content)
   OR jsonb_typeof(v_data->'es') IS DISTINCT FROM 'object' OR octet_length(NEW.content::text)>128000
   THEN RAISE EXCEPTION 'HUB_TRANSLATION_INVALID';END IF;
  v_texts:=public.hub_instruction_texts(v_source.content);
  IF cardinality(v_texts)>1000 OR (SELECT count(*) FROM jsonb_object_keys(v_data->'es'))<>cardinality(v_texts)
   OR EXISTS(SELECT 1 FROM jsonb_each(v_data->'es') e WHERE NOT(e.key=ANY(v_texts))
    OR jsonb_typeof(e.value) IS DISTINCT FROM 'string' OR length(btrim(e.value#>>'{}')) NOT BETWEEN 1 AND 12000)
   THEN RAISE EXCEPTION 'HUB_TRANSLATION_INVALID';END IF;
 END IF;
 IF NEW.definition_kind='activity' AND NEW.locale='en' AND NEW.content?'instruction' AND NEW.status='published'
  AND (TG_OP='INSERT' OR OLD.status<>'published') AND NOT EXISTS(
   SELECT 1 FROM public.hub_content_versions es WHERE es.definition_kind='activity' AND es.definition_id=NEW.definition_id
   AND es.locale='es' AND es.status IN('published','archived') AND es.published_at IS NOT NULL
   AND es.reviewed_by_identity_id IS NOT NULL AND es.reviewed_by_identity_id<>es.author_identity_id
   AND es.content->'displayTranslation'->>'sourceVersionId'=NEW.id::text
   AND es.content->'displayTranslation'->>'sourceFingerprint'=public.hub_instruction_source_hash(NEW.content)
  ) THEN RAISE EXCEPTION 'HUB_TRANSLATION_REQUIRED';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER hub_bilingual_version_guard BEFORE INSERT OR UPDATE ON public.hub_content_versions
 FOR EACH ROW EXECUTE FUNCTION public.hub_validate_bilingual_content();

CREATE FUNCTION public.hub_current_instruction_translation(p_activity_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH source AS (
  SELECT v.* FROM public.hub_content_versions v WHERE v.definition_kind='activity' AND v.definition_id=p_activity_id
  AND v.locale='en' AND v.content?'instruction' AND v.status IN('published','archived') AND v.published_at IS NOT NULL
  ORDER BY v.published_at DESC,v.version_number DESC LIMIT 1
 ) SELECT jsonb_build_object('versionId',es.id,'sourceVersionId',source.id,
  'sourceFingerprint',es.content->'displayTranslation'->>'sourceFingerprint','es',es.content->'displayTranslation'->'es')
 FROM source JOIN public.hub_content_versions es ON es.definition_kind='activity' AND es.definition_id=p_activity_id
 AND es.locale='es' AND es.status IN('published','archived') AND es.published_at IS NOT NULL
 AND es.reviewed_by_identity_id IS NOT NULL AND es.reviewed_by_identity_id<>es.author_identity_id
 AND es.content->'displayTranslation'->>'sourceVersionId'=source.id::text
 AND es.content->'displayTranslation'->>'sourceFingerprint'=public.hub_instruction_source_hash(source.content)
 ORDER BY es.published_at DESC,es.version_number DESC LIMIT 1;
$$;
CREATE FUNCTION public.hub_instruction_translations(p_activity_ids UUID[]) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_activity_ids IS NULL OR cardinality(p_activity_ids)>1000 OR array_position(p_activity_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('activityId',a.id,'translation',public.hub_current_instruction_translation(a.id))),'[]')
  FROM public.hub_activities a WHERE a.id=ANY(p_activity_ids));
END;$$;

CREATE OR REPLACE FUNCTION public.hub_pin_activity_definition() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.definition_snapshot IS DISTINCT FROM OLD.definition_snapshot THEN RAISE EXCEPTION 'HUB_SNAPSHOT_IMMUTABLE';END IF;
 ELSE
  SELECT jsonb_build_object('title',a.title,'content',a.content,'type',a.activity_type,'capturedAt',now(),
   'contentVersionId',(SELECT v.id FROM public.hub_content_versions v WHERE v.definition_kind='activity' AND v.definition_id=a.id
    AND v.locale='en' AND v.content?'instruction' AND v.status IN('published','archived') AND v.published_at IS NOT NULL
    ORDER BY v.published_at DESC,v.version_number DESC LIMIT 1),
   'displayTranslation',public.hub_current_instruction_translation(a.id)) INTO NEW.definition_snapshot
  FROM public.hub_activities a WHERE a.id=NEW.activity_id;
 END IF;
 RETURN NEW;
END;$$;

ALTER TABLE public.hub_theory_question_versions ADD COLUMN display_es JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(display_es)='object');
CREATE FUNCTION public.hub_publish_bilingual_theory_question(p_external_subject TEXT,p_stable_code TEXT,p_expected_version INTEGER,
 p_question TEXT,p_choices JSONB,p_correct_option TEXT,p_source TEXT,p_rationale TEXT,p_spanish JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;v_previous INTEGER;v_created public.hub_theory_question_versions%ROWTYPE;
BEGIN
 v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
 IF EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=v_actor AND r.code='postulante') THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 IF p_stable_code IS NULL OR p_stable_code!~'^[a-z][a-z0-9-]{2,99}$' OR p_expected_version IS NULL OR p_expected_version<0
  OR length(btrim(coalesce(p_question,''))) NOT BETWEEN 5 AND 3000 OR length(btrim(coalesce(p_source,''))) NOT BETWEEN 5 AND 2000
  OR length(btrim(coalesce(p_rationale,''))) NOT BETWEEN 5 AND 2000 OR jsonb_typeof(p_choices) IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_spanish) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 IF jsonb_array_length(p_choices) NOT BETWEEN 2 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c
  WHERE jsonb_typeof(c) IS DISTINCT FROM 'object' OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string'
  OR coalesce(c->>'id','')!~'^[a-zA-Z0-9_-]{1,100}$' OR length(btrim(coalesce(c->>'label',''))) NOT BETWEEN 1 AND 1000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN('id','label')))
  OR (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(p_choices) c)<>jsonb_array_length(p_choices)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE c->>'id'=p_correct_option)
  THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_spanish) k WHERE k NOT IN('question','choices'))
  OR jsonb_typeof(p_spanish->'question') IS DISTINCT FROM 'string' OR length(btrim(p_spanish->>'question')) NOT BETWEEN 5 AND 3000
  OR jsonb_typeof(p_spanish->'choices') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'HUB_TRANSLATION_INVALID';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_spanish->'choices'))<>jsonb_array_length(p_choices)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE jsonb_typeof(p_spanish->'choices'->(c->>'id')) IS DISTINCT FROM 'string'
   OR length(btrim(p_spanish->'choices'->>(c->>'id'))) NOT BETWEEN 1 AND 1000)
  THEN RAISE EXCEPTION 'HUB_TRANSLATION_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hub-question:'||p_stable_code,0));
 SELECT coalesce(max(version),0) INTO v_previous FROM public.hub_theory_question_versions WHERE stable_code=p_stable_code;
 IF v_previous<>p_expected_version THEN RAISE EXCEPTION 'HUB_QUESTION_VERSION_CONFLICT';END IF;
 INSERT INTO public.hub_theory_question_versions(stable_code,version,question,choices,correct_option,source,published,author_id,change_rationale,display_es)
 VALUES(p_stable_code,v_previous+1,btrim(p_question),p_choices,p_correct_option,btrim(p_source),TRUE,v_actor,btrim(p_rationale),
  p_spanish||jsonb_build_object('reviewedBy',v_actor,'reviewedAt',clock_timestamp())) RETURNING * INTO v_created;
 RETURN to_jsonb(v_created);
END;$$;

CREATE FUNCTION public.hub_pin_theory_display_translation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT coalesce(jsonb_agg(q.value||jsonb_build_object('displayEs',v.display_es) ORDER BY q.ordinality),'[]') INTO NEW.theory_snapshot
 FROM jsonb_array_elements(NEW.theory_snapshot) WITH ORDINALITY q(value,ordinality)
 LEFT JOIN public.hub_theory_question_versions v ON v.id=(q.value->>'id')::uuid;
 RETURN NEW;
END;$$;
CREATE TRIGGER hub_pin_theory_display BEFORE INSERT ON public.hub_evaluation_runtime
 FOR EACH ROW EXECUTE FUNCTION public.hub_pin_theory_display_translation();

CREATE OR REPLACE FUNCTION public.hub_runtime_question_translations(p_external_subject TEXT,p_attempt_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;
BEGIN
 v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh','postulante']);
 IF EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=v_actor AND r.code='postulante')
 AND NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id AND identity_id=v_actor) THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('code',q->>'code','question',q->>'question','choices',q->'choices',
  'displayEs',jsonb_build_object('question',q->'displayEs'->'question','choices',q->'displayEs'->'choices'))),'[]') FROM public.hub_evaluation_runtime r CROSS JOIN LATERAL jsonb_array_elements(r.theory_snapshot) q WHERE r.attempt_id=p_attempt_id);
END;$$;

REVOKE ALL ON FUNCTION public.hub_instruction_texts(JSONB,BOOLEAN),public.hub_instruction_source_hash(JSONB),
 public.hub_current_instruction_translation(UUID),public.hub_instruction_translations(UUID[]),
 public.hub_runtime_question_translations(TEXT,UUID),
 public.hub_publish_bilingual_theory_question(TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_instruction_texts(JSONB,BOOLEAN),public.hub_instruction_source_hash(JSONB),
 public.hub_current_instruction_translation(UUID),public.hub_instruction_translations(UUID[]),
 public.hub_runtime_question_translations(TEXT,UUID),
 public.hub_publish_bilingual_theory_question(TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT,TEXT,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.hub_publish_theory_question(TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT,TEXT,TEXT) FROM service_role;
