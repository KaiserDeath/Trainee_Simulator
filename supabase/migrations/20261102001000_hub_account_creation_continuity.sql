-- User authorized the current Account ID Lab rules as the baseline on 2026-11-02.
CREATE TABLE public.hub_account_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), stable_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0), game TEXT NOT NULL,
  policy JSONB NOT NULL, validation_template TEXT NOT NULL,
  source TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_key,version)
);
CREATE TRIGGER hub_account_policies_immutable BEFORE UPDATE OR DELETE ON public.hub_account_policies
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
INSERT INTO public.hub_account_policies(id,stable_key,version,game,policy,validation_template,source) VALUES
('20000000-0000-4000-8000-000000000001','orion-stars-account-id',1,'Orion Stars',
'{"key":"orion-stars-v1","label":"Orion Stars: OS_ + first 6 characters + 3 digits","segments":[{"key":"prefix","kind":"literal","label":"OS_ prefix","value":"OS_"},{"key":"customer","kind":"customer","label":"First 6 customer characters","maxLength":6},{"key":"digits","kind":"random-digits","label":"3 random digits","length":3}]}',
'^OS_{customer6}[0-9]{3}$','User-approved existing Evaluations/src/rules.js behavior, 2026-11-02');

CREATE TABLE public.hub_account_practice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), identity_id UUID NOT NULL REFERENCES public.hub_identities(id),
  enrolment_id UUID NOT NULL REFERENCES public.hub_enrolments(id),
  attempt_id UUID NOT NULL UNIQUE REFERENCES public.hub_attempts(id),
  policy_id UUID NOT NULL REFERENCES public.hub_account_policies(id),
  session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.sandbox_customers(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL REFERENCES public.sandbox_operations(id) ON DELETE RESTRICT,
  game_account_id UUID REFERENCES public.sandbox_game_accounts(id) ON DELETE RESTRICT,
  artifact_id UUID REFERENCES public.hub_attempt_artifacts(id) ON DELETE RESTRICT,
  lab_verified BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE public.hub_activities SET content=content || '{"policyStatus":"approved","executionKind":"account_id_lab","policyVersionId":"20000000-0000-4000-8000-000000000001"}'::jsonb
WHERE stable_code='native-account-id-lab';
UPDATE public.hub_activities SET content=(content-'blockedReason') || '{"policyStatus":"approved","executionKind":"account_creation","policyVersionId":"20000000-0000-4000-8000-000000000001"}'::jsonb
WHERE stable_code='create-linked-training-account';
UPDATE public.hub_activities SET content=(content-'blockedReason') || '{"artifactStatus":"available","executionKind":"exact_player_search"}'::jsonb
WHERE stable_code='search-created-account';

CREATE FUNCTION public.hub_account_practice_view(p_context_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('id',c.id,'attemptId',c.attempt_id,'game',p.game,
    'customerUsername',u.username,'policy',p.policy,'policyVersionId',p.id,
    'labVerified',c.lab_verified,'operation',jsonb_build_object('id',o.id,'type',o.type,'status',o.status),
    'account',CASE WHEN g.id IS NOT NULL THEN jsonb_build_object('id',g.id,'identifier',g.game_username) END,
    'artifactId',c.artifact_id)
  FROM public.hub_account_practice c JOIN public.hub_account_policies p ON p.id=c.policy_id
  JOIN public.sandbox_customers u ON u.id=c.customer_id JOIN public.sandbox_operations o ON o.id=c.operation_id
  LEFT JOIN public.sandbox_game_accounts g ON g.id=c.game_account_id WHERE c.id=p_context_id;
$$;

CREATE FUNCTION public.hub_account_practice_command(p_external_subject TEXT,p_activity_id UUID,
  p_command TEXT,p_input JSONB,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor UUID; v_activity public.hub_activities%ROWTYPE; v_start JSONB;
  v_context public.hub_account_practice%ROWTYPE; v_policy public.hub_account_policies%ROWTYPE;
  v_customer UUID; v_session UUID; v_operation UUID; v_account UUID; v_artifact UUID; v_enrolment UUID;
  v_username TEXT; v_identifier TEXT; v_password TEXT; v_pattern TEXT; v_state JSONB;
  v_claim public.hub_idempotency_keys%ROWTYPE; v_fingerprint TEXT; v_result JSONB;
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
  IF p_command IS NULL OR p_command NOT IN ('start','validate','create','confirm') OR p_input IS NULL
     OR jsonb_typeof(p_input)<>'object' OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  SELECT * INTO v_activity FROM public.hub_activities WHERE id=p_activity_id;
  IF coalesce(v_activity.content->>'executionKind','') NOT IN ('account_id_lab','account_creation') OR v_activity.id IS NULL THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('activity',p_activity_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
  INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint)
    VALUES(v_actor,'account_practice',p_idempotency_key,v_fingerprint) ON CONFLICT DO NOTHING;
  SELECT * INTO v_claim FROM public.hub_idempotency_keys WHERE identity_id=v_actor AND action_code='account_practice' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_claim.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT'; END IF;
  IF v_claim.response IS NOT NULL THEN RETURN v_claim.response; END IF;
  SELECT e.id INTO v_enrolment FROM public.hub_enrolments e JOIN public.hub_modules m ON m.course_id=e.course_id
    WHERE e.identity_id=v_actor AND m.id=v_activity.module_id AND e.status<>'withdrawn' FOR UPDATE OF e;
  IF v_enrolment IS NULL THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED'; END IF;
  SELECT c.* INTO v_context FROM public.hub_account_practice c
    JOIN public.hub_attempts a ON a.id=c.attempt_id WHERE c.enrolment_id=v_enrolment AND a.module_id=v_activity.module_id ORDER BY c.created_at DESC LIMIT 1;
  -- Read/resume completed practice without allocating a new module attempt.
  IF p_command='start' AND v_context.id IS NOT NULL THEN
    v_result:=public.hub_account_practice_view(v_context.id);
  ELSIF p_command='confirm' AND v_context.artifact_id IS NOT NULL THEN
    RAISE EXCEPTION 'HUB_ACCOUNT_ALREADY_CONFIRMED';
  ELSE
    v_start:=public.hub_start_activity_attempt(p_external_subject,p_activity_id,'{}',p_idempotency_key);
    IF v_context.id IS NULL THEN
      SELECT * INTO v_policy FROM public.hub_account_policies WHERE id=(v_activity.content->>'policyVersionId')::uuid;
      IF v_policy.id IS NULL THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
      INSERT INTO public.trainee_sessions(trainee_name,status,duration_minutes) VALUES('Hub account practice','practice',NULL) RETURNING id INTO v_session;
      v_username:='Practice'||substr(replace(v_actor::text,'-',''),1,8);
      INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(v_session,v_username,0) RETURNING id INTO v_customer;
      INSERT INTO public.sandbox_operations(session_id,customer_id,type,game,queue_policy_version) VALUES(v_session,v_customer,'CREATE ACCOUNT',v_policy.game,1) RETURNING id INTO v_operation;
      INSERT INTO public.hub_account_practice(identity_id,enrolment_id,attempt_id,policy_id,session_id,customer_id,operation_id)
        VALUES(v_actor,v_enrolment,(v_start->>'attemptId')::uuid,v_policy.id,v_session,v_customer,v_operation) RETURNING * INTO v_context;
      UPDATE public.hub_attempts SET legacy_trainee_session_id=v_session WHERE id=v_context.attempt_id;
    END IF;
    SELECT * INTO v_context FROM public.hub_account_practice WHERE id=v_context.id FOR UPDATE;
    SELECT * INTO v_policy FROM public.hub_account_policies WHERE id=v_context.policy_id;
    SELECT username INTO v_username FROM public.sandbox_customers WHERE id=v_context.customer_id;
    v_identifier:=btrim(coalesce(p_input->>'identifier','')); v_password:=btrim(coalesce(p_input->>'password',''));
    v_pattern:=replace(v_policy.validation_template,'{customer6}',left(regexp_replace(v_username,'[^a-zA-Z0-9]','','g'),6));
    v_pattern:=replace(v_pattern,'{customer}',left(regexp_replace(v_username,'[^a-zA-Z0-9]','','g'),coalesce((v_policy.policy#>>'{segments,1,maxLength}')::integer,6)));
    IF p_command IN ('validate','create') AND v_identifier !~* v_pattern THEN RAISE EXCEPTION 'HUB_IDENTIFIER_MISMATCH'; END IF;
    IF p_command='validate' THEN
      IF v_activity.content->>'executionKind'<>'account_id_lab' THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
      UPDATE public.hub_account_practice SET lab_verified=TRUE WHERE id=v_context.id;
      PERFORM public.hub_complete_activity_attempt(p_external_subject,(v_start->>'activityAttemptId')::uuid,
        jsonb_build_object('answer',v_identifier,'policyVersionId',v_policy.id,'serverVerified',TRUE),p_idempotency_key);
    ELSIF p_command='create' THEN
      IF v_activity.content->>'executionKind'<>'account_creation' OR NOT v_context.lab_verified THEN RAISE EXCEPTION 'HUB_PREREQUISITE_INCOMPLETE'; END IF;
      IF v_context.game_account_id IS NOT NULL THEN RAISE EXCEPTION 'HUB_ACCOUNT_ALREADY_CREATED'; END IF;
      IF length(v_password) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
      INSERT INTO public.sandbox_game_accounts(session_id,customer_id,game,game_username,nickname,password,balance)
        VALUES(v_context.session_id,v_context.customer_id,v_policy.game,v_identifier,v_identifier,v_password,0) RETURNING id INTO v_account;
      INSERT INTO public.sandbox_game_history(session_id,customer_id,game_account_id,type,description)
        VALUES(v_context.session_id,v_context.customer_id,v_account,'GAME CREATE ACCOUNT',v_policy.game||' account created: '||v_identifier);
      UPDATE public.hub_account_practice SET game_account_id=v_account WHERE id=v_context.id;
    ELSIF p_command='confirm' THEN
      IF v_activity.content->>'executionKind'<>'account_creation' OR v_context.game_account_id IS NULL OR NOT v_context.lab_verified THEN RAISE EXCEPTION 'HUB_PREREQUISITE_INCOMPLETE'; END IF;
      IF coalesce(p_input->>'kiosk','')<>'OrionStars' OR NOT EXISTS(SELECT 1 FROM public.sandbox_game_accounts
        WHERE id=v_context.game_account_id AND game_username=v_identifier AND password=v_password) THEN RAISE EXCEPTION 'HUB_ACCOUNT_CONFIRMATION_MISMATCH'; END IF;
      UPDATE public.sandbox_operations SET status='APPROVED',processed_at=now(),processed_by=v_actor::text,is_correct=TRUE,
        game_account_id=v_context.game_account_id,request_data=jsonb_build_object('gameId',v_identifier,'kiosk','OrionStars','passwordProvided',TRUE)
        WHERE id=v_context.operation_id AND status='PENDING';
      v_state:=jsonb_build_object('identifier',v_identifier,'game',v_policy.game,'sourceSessionId',v_context.session_id,
        'customerId',v_context.customer_id,'accountId',v_context.game_account_id,'originatingOperationId',v_context.operation_id,
        'policyVersionId',v_policy.id,'backendConfirmedAt',now());
      INSERT INTO public.hub_attempt_artifacts(attempt_id,activity_attempt_id,artifact_type,payload)
        VALUES(v_context.attempt_id,(v_start->>'activityAttemptId')::uuid,'CREATED_GAME_ACCOUNT',v_state) RETURNING id INTO v_artifact;
      UPDATE public.hub_account_practice SET artifact_id=v_artifact WHERE id=v_context.id;
      PERFORM public.hub_complete_activity_attempt(p_external_subject,(v_start->>'activityAttemptId')::uuid,
        jsonb_build_object('artifactId',v_artifact,'serverVerified',TRUE),p_idempotency_key);
    END IF;
    v_result:=public.hub_account_practice_view(v_context.id);
  END IF;
  UPDATE public.hub_idempotency_keys SET response=v_result WHERE identity_id=v_actor AND action_code='account_practice' AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END; $$;

CREATE FUNCTION public.hub_guard_account_practice_completion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_kind TEXT; v_enrolment UUID; v_artifact public.hub_attempt_artifacts%ROWTYPE;
BEGIN
  IF NEW.status='completed' AND OLD.status<>'completed' THEN
    SELECT content->>'executionKind' INTO v_kind FROM public.hub_activities WHERE id=NEW.activity_id;
    IF v_kind='account_id_lab' AND NOT EXISTS(SELECT 1 FROM public.hub_account_practice WHERE attempt_id=NEW.attempt_id AND lab_verified) THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
    IF v_kind='account_creation' AND NOT EXISTS(SELECT 1 FROM public.hub_account_practice WHERE attempt_id=NEW.attempt_id AND artifact_id IS NOT NULL) THEN RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED'; END IF;
    IF v_kind='exact_player_search' THEN
      SELECT p.enrolment_id INTO v_enrolment FROM public.hub_attempts a JOIN public.hub_module_progress p ON p.id=a.module_progress_id WHERE a.id=NEW.attempt_id;
      SELECT art.* INTO v_artifact FROM public.hub_attempt_artifacts art JOIN public.hub_account_practice c ON c.artifact_id=art.id
        WHERE c.enrolment_id=v_enrolment AND art.id::text=NEW.state->>'sourceArtifactId';
      IF v_artifact.id IS NULL OR coalesce(NEW.state#>>'{searchProcedure,ctrlFObserved}','false')<>'true'
        OR coalesce(NEW.state#>>'{searchProcedure,ctrlVObserved}','false')<>'true'
        OR coalesce(NEW.state#>>'{searchProcedure,confirmed}','false')<>'true'
        OR coalesce(NEW.state#>>'{searchProcedure,exactQuery}','')<>v_artifact.payload->>'identifier'
        OR coalesce(NEW.state#>>'{searchProcedure,matchedIdentifier}','')<>v_artifact.payload->>'identifier' THEN
        RAISE EXCEPTION 'HUB_ACTIVITY_BLOCKED';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_guard_account_completion BEFORE UPDATE ON public.hub_activity_attempts
FOR EACH ROW EXECUTE FUNCTION public.hub_guard_account_practice_completion();

ALTER TABLE public.hub_account_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_account_practice ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_account_policies,public.hub_account_practice FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_account_policies,public.hub_account_practice TO service_role;
REVOKE ALL ON FUNCTION public.hub_account_practice_view(UUID),public.hub_account_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_account_practice_view(UUID),public.hub_account_practice_command(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
