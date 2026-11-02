CREATE TABLE public.hub_account_policy_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),base_policy_id UUID NOT NULL REFERENCES public.hub_account_policies(id),
  configuration JSONB NOT NULL,change_rationale TEXT NOT NULL,
  author_identity_id UUID NOT NULL REFERENCES public.hub_identities(id),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','rejected')),
  reviewed_by_identity_id UUID REFERENCES public.hub_identities(id),review_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),reviewed_at TIMESTAMPTZ,
  CHECK(reviewed_by_identity_id IS NULL OR reviewed_by_identity_id<>author_identity_id)
);
CREATE FUNCTION public.hub_propose_account_policy(p_external_subject TEXT,p_base_policy_id UUID,p_configuration JSONB,p_rationale TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;v_proposal public.hub_account_policy_proposals%ROWTYPE;
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['admin']);
  IF p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object' OR p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 1 AND 2000
    OR length(coalesce(p_configuration->>'label','')) NOT BETWEEN 1 AND 200
    OR coalesce(p_configuration->>'prefix','') !~ '^[a-zA-Z0-9_ ]{0,16}$'
    OR coalesce(p_configuration->>'suffix','') !~ '^[a-zA-Z0-9_ ]{0,16}$'
    OR coalesce(p_configuration->>'customerLength','') !~ '^[0-9]{1,2}$'
    OR coalesce(p_configuration->>'digits','') !~ '^[0-9]$'
    OR (p_configuration->>'customerLength')::integer NOT BETWEEN 1 AND 32
    OR (p_configuration->>'digits')::integer NOT BETWEEN 1 AND 8
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_configuration) k WHERE k NOT IN ('label','prefix','suffix','customerLength','digits')) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_account_policies WHERE id=p_base_policy_id) THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND'; END IF;
  INSERT INTO public.hub_account_policy_proposals(base_policy_id,configuration,change_rationale,author_identity_id)
    VALUES(p_base_policy_id,p_configuration,btrim(p_rationale),v_actor) RETURNING * INTO v_proposal;
  RETURN to_jsonb(v_proposal);
END; $$;
CREATE FUNCTION public.hub_review_account_policy(p_external_subject TEXT,p_proposal_id UUID,p_decision TEXT,p_rationale TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor UUID;v_proposal public.hub_account_policy_proposals%ROWTYPE;v_base public.hub_account_policies%ROWTYPE;
  v_version INTEGER;v_id UUID:=gen_random_uuid();v_segments JSONB;v_pattern TEXT;
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['admin']);
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject') OR p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  SELECT * INTO v_proposal FROM public.hub_account_policy_proposals WHERE id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND'; END IF;
  IF v_proposal.author_identity_id=v_actor THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED'; END IF;
  IF v_proposal.status<>'pending_review' THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT'; END IF;
  IF p_decision='approve' THEN
    SELECT * INTO v_base FROM public.hub_account_policies WHERE id=v_proposal.base_policy_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.hub_activities WHERE content->>'policyVersionId'=v_base.id::text) THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT'; END IF;
    SELECT max(version)+1 INTO v_version FROM public.hub_account_policies WHERE stable_key=v_base.stable_key;
    v_segments:=jsonb_build_array(
      jsonb_build_object('key','prefix','kind','literal','label','Game prefix','value',coalesce(v_proposal.configuration->>'prefix','')),
      jsonb_build_object('key','customer','kind','customer','label','Customer characters','maxLength',(v_proposal.configuration->>'customerLength')::integer),
      jsonb_build_object('key','suffix','kind','literal','label','Game suffix','value',coalesce(v_proposal.configuration->>'suffix','')),
      jsonb_build_object('key','digits','kind','random-digits','label','Random digits','length',(v_proposal.configuration->>'digits')::integer));
    v_pattern:='^'||coalesce(v_proposal.configuration->>'prefix','')||'{customer}'||coalesce(v_proposal.configuration->>'suffix','')||'[0-9]{'||(v_proposal.configuration->>'digits')||'}$';
    INSERT INTO public.hub_account_policies(id,stable_key,version,game,policy,validation_template,source)
      VALUES(v_id,v_base.stable_key,v_version,v_base.game,jsonb_build_object('key',v_base.stable_key||'-v'||v_version,'label',v_proposal.configuration->>'label','segments',v_segments),v_pattern,'Approved proposal '||v_proposal.id);
    UPDATE public.hub_activities SET content=jsonb_set(content,'{policyVersionId}',to_jsonb(v_id::text)),updated_at=now() WHERE content->>'policyVersionId'=v_base.id::text;
  END IF;
  UPDATE public.hub_account_policy_proposals SET status=CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
    reviewed_by_identity_id=v_actor,review_rationale=btrim(p_rationale),reviewed_at=now() WHERE id=v_proposal.id RETURNING * INTO v_proposal;
  RETURN to_jsonb(v_proposal);
END; $$;
ALTER TABLE public.hub_account_policy_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_account_policy_proposals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_account_policy_proposals TO service_role;
REVOKE ALL ON FUNCTION public.hub_propose_account_policy(TEXT,UUID,JSONB,TEXT),public.hub_review_account_policy(TEXT,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_propose_account_policy(TEXT,UUID,JSONB,TEXT),public.hub_review_account_policy(TEXT,UUID,TEXT,TEXT) TO service_role;
