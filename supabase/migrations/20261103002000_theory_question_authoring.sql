ALTER TABLE public.hub_theory_question_versions ADD COLUMN author_id UUID REFERENCES public.hub_identities(id),ADD COLUMN change_rationale TEXT;
CREATE FUNCTION public.hub_publish_theory_question(p_external_subject TEXT,p_stable_code TEXT,p_expected_version INTEGER,p_question TEXT,p_choices JSONB,p_correct_option TEXT,p_source TEXT,p_rationale TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;previous INTEGER;created public.hub_theory_question_versions%ROWTYPE;
BEGIN
  actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
  IF p_stable_code IS NULL OR p_stable_code!~'^[a-z][a-z0-9-]{2,99}$' OR p_expected_version IS NULL OR p_expected_version<0
    OR length(btrim(coalesce(p_question,''))) NOT BETWEEN 5 AND 3000 OR length(btrim(coalesce(p_source,''))) NOT BETWEEN 5 AND 2000
    OR length(btrim(coalesce(p_rationale,''))) NOT BETWEEN 5 AND 2000 OR jsonb_typeof(p_choices) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  IF jsonb_array_length(p_choices) NOT BETWEEN 2 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c
    WHERE jsonb_typeof(c) IS DISTINCT FROM 'object' OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string'
      OR coalesce(c->>'id','')!~'^[a-zA-Z0-9_-]{1,100}$'
      OR length(btrim(coalesce(c->>'label',''))) NOT BETWEEN 1 AND 1000
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key NOT IN ('id','label')))
    OR (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(p_choices) c)<>jsonb_array_length(p_choices)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_choices) c WHERE c->>'id'=p_correct_option) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hub-question:'||p_stable_code,0));
  SELECT coalesce(max(version),0) INTO previous FROM public.hub_theory_question_versions WHERE stable_code=p_stable_code;
  IF previous<>p_expected_version THEN RAISE EXCEPTION 'HUB_QUESTION_VERSION_CONFLICT';END IF;
  INSERT INTO public.hub_theory_question_versions(stable_code,version,question,choices,correct_option,source,published,author_id,change_rationale)
  VALUES(p_stable_code,previous+1,btrim(p_question),p_choices,p_correct_option,btrim(p_source),TRUE,actor,btrim(p_rationale)) RETURNING * INTO created;
  RETURN to_jsonb(created);
END; $$;
REVOKE ALL ON FUNCTION public.hub_publish_theory_question(TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_publish_theory_question(TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT,TEXT,TEXT) TO service_role;
