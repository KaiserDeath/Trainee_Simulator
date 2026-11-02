-- Reuse the existing simulator rule: nonempty password, exact player and kiosk,
-- and evidence that the game-side password was changed before Backend confirmation.
CREATE TABLE public.hub_credential_practice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), identity_id UUID NOT NULL REFERENCES public.hub_identities(id),
  activity_attempt_id UUID NOT NULL UNIQUE REFERENCES public.hub_activity_attempts(id),
  source_context_id UUID NOT NULL REFERENCES public.hub_account_practice(id),
  operation_id UUID NOT NULL REFERENCES public.sandbox_operations(id) ON DELETE RESTRICT,
  reset_at TIMESTAMPTZ, confirmed_at TIMESTAMPTZ
);
UPDATE public.hub_activities SET content=(content-'blockedReason')||'{"policyStatus":"approved","executionKind":"reset_current_account"}'::jsonb
WHERE stable_code='reset-password-policy-gated-practice';

CREATE FUNCTION public.hub_credential_practice_view(p_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
SELECT jsonb_build_object('id',c.id,'game',g.game,'identifier',g.game_username,'resetPerformed',c.reset_at IS NOT NULL,
  'confirmed',c.confirmed_at IS NOT NULL,'operation',jsonb_build_object('id',o.id,'type',o.type,'status',o.status))
FROM public.hub_credential_practice c JOIN public.hub_account_practice a ON a.id=c.source_context_id
JOIN public.sandbox_game_accounts g ON g.id=a.game_account_id JOIN public.sandbox_operations o ON o.id=c.operation_id WHERE c.id=p_id;
$$;
CREATE FUNCTION public.hub_credential_practice_command(p_external_subject TEXT,p_activity_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor UUID; v_start JSONB; v_context public.hub_credential_practice%ROWTYPE;
  v_source public.hub_account_practice%ROWTYPE; v_enrolment UUID; v_operation UUID;
  v_claim public.hub_idempotency_keys%ROWTYPE; v_fingerprint TEXT; v_result JSONB;
  v_password TEXT:=btrim(coalesce(p_input->>'password','')); v_identifier TEXT:=btrim(coalesce(p_input->>'identifier',''));
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
  IF p_command IS NULL OR p_command NOT IN ('start','reset','confirm') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_activities WHERE id=p_activity_id AND content->>'executionKind'='reset_current_account') THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('activity',p_activity_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
  INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(v_actor,'credential_practice',p_idempotency_key,v_fingerprint) ON CONFLICT DO NOTHING;
  SELECT * INTO v_claim FROM public.hub_idempotency_keys WHERE identity_id=v_actor AND action_code='credential_practice' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_claim.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT'; END IF;
  IF v_claim.response IS NOT NULL THEN RETURN v_claim.response; END IF;
  SELECT e.id INTO v_enrolment FROM public.hub_enrolments e JOIN public.hub_modules m ON m.course_id=e.course_id
    JOIN public.hub_activities a ON a.module_id=m.id WHERE a.id=p_activity_id AND e.identity_id=v_actor AND e.status<>'withdrawn' FOR UPDATE OF e;
  IF v_enrolment IS NULL THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED'; END IF;
  SELECT c.* INTO v_context FROM public.hub_credential_practice c JOIN public.hub_activity_attempts a ON a.id=c.activity_attempt_id
    WHERE c.identity_id=v_actor AND a.activity_id=p_activity_id ORDER BY a.created_at DESC LIMIT 1;
  IF p_command='start' AND v_context.id IS NOT NULL THEN RETURN public.hub_credential_practice_view(v_context.id); END IF;
  v_start:=public.hub_start_activity_attempt(p_external_subject,p_activity_id,'{}',p_idempotency_key);
  IF v_context.id IS NULL THEN
    SELECT * INTO v_source FROM public.hub_account_practice WHERE enrolment_id=v_enrolment AND artifact_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
    IF v_source.id IS NULL THEN RAISE EXCEPTION 'HUB_PREREQUISITE_INCOMPLETE'; END IF;
    INSERT INTO public.sandbox_operations(session_id,customer_id,game_account_id,type,game,queue_policy_version)
      VALUES(v_source.session_id,v_source.customer_id,v_source.game_account_id,'RESET PASSWORD','Orion Stars',1) RETURNING id INTO v_operation;
    INSERT INTO public.hub_credential_practice(identity_id,activity_attempt_id,source_context_id,operation_id)
      VALUES(v_actor,(v_start->>'activityAttemptId')::uuid,v_source.id,v_operation) RETURNING * INTO v_context;
    UPDATE public.hub_attempts SET legacy_trainee_session_id=v_source.session_id WHERE id=(v_start->>'attemptId')::uuid;
  END IF;
  SELECT * INTO v_context FROM public.hub_credential_practice WHERE id=v_context.id FOR UPDATE;
  SELECT * INTO v_source FROM public.hub_account_practice WHERE id=v_context.source_context_id;
  IF p_command IN ('reset','confirm') AND (length(v_password) NOT BETWEEN 1 AND 200 OR NOT EXISTS(
    SELECT 1 FROM public.sandbox_game_accounts WHERE id=v_source.game_account_id AND game_username=v_identifier)) THEN RAISE EXCEPTION 'HUB_ACCOUNT_CONFIRMATION_MISMATCH'; END IF;
  IF p_command='reset' THEN
    IF v_context.reset_at IS NOT NULL THEN RAISE EXCEPTION 'HUB_ACCOUNT_ALREADY_CREATED'; END IF;
    UPDATE public.sandbox_game_accounts SET password=v_password WHERE id=v_source.game_account_id;
    INSERT INTO public.sandbox_game_history(session_id,customer_id,game_account_id,type,description)
      VALUES(v_source.session_id,v_source.customer_id,v_source.game_account_id,'GAME RESET PASSWORD','Orion Stars password reset for '||v_identifier);
    UPDATE public.hub_credential_practice SET reset_at=now() WHERE id=v_context.id;
  ELSIF p_command='confirm' THEN
    IF v_context.reset_at IS NULL OR coalesce(p_input->>'kiosk','')<>'OrionStars' OR NOT EXISTS(
      SELECT 1 FROM public.sandbox_game_accounts WHERE id=v_source.game_account_id AND password=v_password) THEN RAISE EXCEPTION 'HUB_ACCOUNT_CONFIRMATION_MISMATCH'; END IF;
    IF v_context.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'HUB_ACCOUNT_ALREADY_CONFIRMED'; END IF;
    UPDATE public.sandbox_operations SET status='APPROVED',is_correct=TRUE,processed_at=now(),processed_by=v_actor::text,
      request_data=jsonb_build_object('gameId',v_identifier,'kiosk','OrionStars','passwordProvided',TRUE) WHERE id=v_context.operation_id AND status='PENDING';
    UPDATE public.hub_credential_practice SET confirmed_at=now() WHERE id=v_context.id;
    PERFORM public.hub_complete_activity_attempt(p_external_subject,v_context.activity_attempt_id,jsonb_build_object('operationId',v_context.operation_id,'passwordProvided',TRUE,'serverVerified',TRUE),p_idempotency_key);
  END IF;
  v_result:=public.hub_credential_practice_view(v_context.id);
  UPDATE public.hub_idempotency_keys SET response=v_result WHERE identity_id=v_actor AND action_code='credential_practice' AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END; $$;
CREATE FUNCTION public.hub_guard_credential_completion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status<>'completed' AND EXISTS(SELECT 1 FROM public.hub_activities
    WHERE id=NEW.activity_id AND content->>'executionKind'='reset_current_account')
    AND NOT EXISTS(SELECT 1 FROM public.hub_credential_practice WHERE activity_attempt_id=NEW.id AND confirmed_at IS NOT NULL)
    THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_credential_completion BEFORE UPDATE ON public.hub_activity_attempts FOR EACH ROW EXECUTE FUNCTION public.hub_guard_credential_completion();
ALTER TABLE public.hub_credential_practice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_credential_practice FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_credential_practice TO service_role;
REVOKE ALL ON FUNCTION public.hub_credential_practice_view(UUID),public.hub_credential_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_credential_practice_view(UUID),public.hub_credential_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
