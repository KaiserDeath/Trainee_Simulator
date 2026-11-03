-- Native Orion assessment actions. Only server-derived state reaches the scorer.
-- This adapter covers the seven game-platform actions; Backend assessment
-- extensions remain unavailable until their own action/evidence adapters exist.
CREATE TABLE public.hub_theory_question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),stable_code TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),
  question TEXT NOT NULL,choices JSONB NOT NULL CHECK(jsonb_typeof(choices)='array'),correct_option TEXT NOT NULL,
  source TEXT NOT NULL,published BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stable_code,version)
);
CREATE TRIGGER hub_theory_versions_immutable BEFORE UPDATE OR DELETE ON public.hub_theory_question_versions
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
INSERT INTO public.hub_theory_question_versions(stable_code,version,question,choices,correct_option,source,published) VALUES
('verification-first',1,'What must be verified before changing customer credits?',
 '[{"id":"verify","label":"The exact customer, licensed game access, amount and relevant histories"},{"id":"name","label":"Only the displayed customer name"},{"id":"repeat","label":"Repeat the movement to discover its effect"}]','verify','Existing verification-first operator requirements; baseline authorized 2026-11-02',TRUE),
('no-duplicate-credit',1,'A matching game movement already exists. What is the safe next step?',
 '[{"id":"again","label":"Perform the game movement again"},{"id":"evidence","label":"Use the recorded evidence and the permitted Backend decision without posting it again"},{"id":"ignore","label":"Ignore the history"}]','evidence','Existing already-processed/reconciliation rules; baseline authorized 2026-11-02',TRUE),
('exact-player',1,'Which player should receive the assigned account operation?',
 '[{"id":"similar","label":"The first similarly named player"},{"id":"recent","label":"The most recently used player"},{"id":"exact","label":"The exact verified player in the correct assigned game context"}]','exact','Existing exact-player requirements; baseline authorized 2026-11-02',TRUE),
('credential-evidence',1,'What password evidence may be retained in ordinary training reports?',
 '[{"id":"literal","label":"The password literal"},{"id":"provided","label":"Only whether the required value was provided or matched"},{"id":"token","label":"A login token containing the credentials"}]','provided','Existing credential-redaction requirements; baseline authorized 2026-11-02',TRUE);

CREATE TABLE public.hub_evaluation_runtime (
  attempt_id UUID PRIMARY KEY REFERENCES public.hub_scored_evaluation_attempts(id) ON DELETE RESTRICT,
  theory_snapshot JSONB NOT NULL,theory_answers JSONB NOT NULL DEFAULT '{}',
  action_cursor INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.hub_evaluation_worlds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id UUID NOT NULL REFERENCES public.hub_evaluation_runtime(attempt_id),
  game_family_key TEXT NOT NULL,session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.sandbox_customers(id),account_id UUID REFERENCES public.sandbox_game_accounts(id),
  account_policy_id UUID NOT NULL REFERENCES public.hub_account_policies(id),
  pending_operation_id UUID REFERENCES public.sandbox_operations(id),
  history_read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(attempt_id,game_family_key)
);
CREATE TABLE public.hub_evaluation_action_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),attempt_id UUID NOT NULL REFERENCES public.hub_evaluation_runtime(attempt_id),
  sequence_number INTEGER NOT NULL,item_code TEXT NOT NULL,game_family_key TEXT NOT NULL,is_correct BOOLEAN NOT NULL,
  evidence JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(attempt_id,sequence_number)
);
CREATE TRIGGER hub_evaluation_action_evidence_immutable BEFORE UPDATE OR DELETE ON public.hub_evaluation_action_evidence
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE FUNCTION public.hub_prepare_evaluation_task(p_attempt_id UUID) RETURNS VOID
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.hub_scored_evaluation_attempts%ROWTYPE;r public.hub_evaluation_runtime%ROWTYPE;
  w public.hub_evaluation_worlds%ROWTYPE;g public.sandbox_game_accounts%ROWTYPE;
  actions JSONB;action TEXT;family TEXT;kind TEXT;backend_code TEXT;o public.sandbox_operations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id;
  SELECT * INTO r FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id;
  actions:=a.settings_snapshot->'requiredActionCodes';
  IF r.action_cursor>=jsonb_array_length(actions)*jsonb_array_length(a.settings_snapshot->'gameFamilyKeys') THEN RETURN; END IF;
  action:=actions->>(r.action_cursor%jsonb_array_length(actions));family:=a.settings_snapshot->'gameFamilyKeys'->>(r.action_cursor/jsonb_array_length(actions));
  IF action='RESOLVE_RECONCILIATION' THEN
    SELECT * INTO w FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id AND game_family_key=family FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.sandbox_operations WHERE id=w.pending_operation_id AND status='PENDING') THEN RETURN;END IF;
    SELECT * INTO g FROM public.sandbox_game_accounts WHERE id=w.account_id;
    IF g.id IS NULL THEN RAISE EXCEPTION 'HUB_RUNTIME_NOT_STARTED';END IF;
    SELECT * INTO o FROM public.create_reserved_sandbox_operation(jsonb_build_object('id',gen_random_uuid(),'session_id',w.session_id,'customer_id',w.customer_id,
      'game_account_id',w.account_id,'game','Orion Stars','type','ADD CREDITS','amount',50,'customer_balance_at_request',(SELECT balance FROM public.sandbox_customers WHERE id=w.customer_id),'game_balance_at_request',g.balance,'created_at',clock_timestamp()));
    PERFORM public.apply_sandbox_movement_scenario(o.id,'PENDING_RECONCILIATION',random()<0.5);
    UPDATE public.hub_evaluation_worlds SET pending_operation_id=o.id,history_read_at=NULL WHERE id=w.id;
    RETURN;
  END IF;
  kind:=CASE action WHEN 'CREATE_ACCOUNT' THEN 'CREATE ACCOUNT' WHEN 'VERIFY_BALANCE' THEN 'REFRESH BALANCE' WHEN 'ADD_CREDITS' THEN 'ADD CREDITS' WHEN 'WITHDRAW_CREDITS' THEN 'WITHDRAW CREDITS' WHEN 'RESET_PASSWORD_EDIT_INFORMATION' THEN 'RESET PASSWORD' END;
  backend_code:=CASE action WHEN 'VERIFY_BALANCE' THEN 'BACKEND_REFRESH_BALANCE' WHEN 'RESET_PASSWORD_EDIT_INFORMATION' THEN 'BACKEND_RESET_PASSWORD' ELSE 'BACKEND_'||action END;
  IF kind IS NULL OR NOT(actions ? backend_code) THEN RETURN; END IF;
  SELECT * INTO w FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id AND game_family_key=family FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.sandbox_operations WHERE id=w.pending_operation_id AND status='PENDING') THEN RETURN; END IF;
  SELECT * INTO g FROM public.sandbox_game_accounts WHERE id=w.account_id;
  SELECT * INTO o FROM public.create_reserved_sandbox_operation(jsonb_build_object('id',gen_random_uuid(),'session_id',w.session_id,'customer_id',w.customer_id,
    'game_account_id',w.account_id,'game','Orion Stars','type',kind,'amount',CASE kind WHEN 'ADD CREDITS' THEN 50 WHEN 'WITHDRAW CREDITS' THEN 25 ELSE 0 END,
    'customer_balance_at_request',(SELECT balance FROM public.sandbox_customers WHERE id=w.customer_id),'game_balance_at_request',coalesce(g.balance,0),'created_at',clock_timestamp()));
  UPDATE public.hub_evaluation_worlds SET pending_operation_id=o.id,history_read_at=NULL WHERE id=w.id;
END; $$;

CREATE FUNCTION public.hub_evaluation_runtime_view(p_attempt_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_attempt public.hub_scored_evaluation_attempts%ROWTYPE;v_runtime public.hub_evaluation_runtime%ROWTYPE;
  v_actions JSONB;v_family TEXT;v_action TEXT;v_world public.hub_evaluation_worlds%ROWTYPE;v_account public.sandbox_game_accounts%ROWTYPE;
  v_questions JSONB;v_customer TEXT;v_wallet NUMERIC;
BEGIN
  SELECT * INTO v_attempt FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id;
  IF v_attempt.status<>'in_progress' THEN RETURN jsonb_build_object('attemptId',p_attempt_id,'status',v_attempt.status,'score',v_attempt.score,'result',v_attempt.result_status); END IF;
  SELECT * INTO v_runtime FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_RUNTIME_NOT_STARTED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',q->>'code','question',q->>'question','choices',q->'choices')),'[]') INTO v_questions FROM jsonb_array_elements(v_runtime.theory_snapshot) q;
  v_actions:=v_attempt.settings_snapshot->'requiredActionCodes';
  IF v_runtime.action_cursor < jsonb_array_length(v_actions)*jsonb_array_length(v_attempt.settings_snapshot->'gameFamilyKeys') THEN
    v_family:=v_attempt.settings_snapshot->'gameFamilyKeys'->>(v_runtime.action_cursor/jsonb_array_length(v_actions));
    v_action:=v_actions->>(v_runtime.action_cursor%jsonb_array_length(v_actions));
    SELECT * INTO v_world FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id AND game_family_key=v_family;
    SELECT * INTO v_account FROM public.sandbox_game_accounts WHERE id=v_world.account_id;
    SELECT username INTO v_customer FROM public.sandbox_customers WHERE id=v_world.customer_id;
    SELECT balance INTO v_wallet FROM public.sandbox_game_wallets WHERE session_id=v_world.session_id AND game='Orion Stars';
  END IF;
  RETURN jsonb_build_object('attemptId',p_attempt_id,'status',v_attempt.status,'expiresAt',v_attempt.expires_at,
    'questions',v_questions,'theorySubmitted',v_runtime.theory_answers<>'{}'::jsonb,
    'completedActions',v_runtime.action_cursor,'totalActions',jsonb_array_length(v_actions)*jsonb_array_length(v_attempt.settings_snapshot->'gameFamilyKeys'),
    'task',CASE WHEN v_action IS NOT NULL THEN jsonb_build_object('action',v_action,'gameFamily',v_family,'game','Orion Stars',
      'customerUsername',v_customer,'identifier',v_account.game_username,'credit',coalesce(v_account.balance,0),'availableBalance',v_wallet,
      'customerBalance',(SELECT balance FROM public.sandbox_customers WHERE id=v_world.customer_id),
      'operation',(SELECT jsonb_build_object('id',id,'type',type,'status',status,'amount',amount,'requestedAt',created_at) FROM public.sandbox_operations WHERE id=v_world.pending_operation_id),
      'amount',CASE WHEN v_action='ADD_CREDITS' THEN 50 WHEN v_action='WITHDRAW_CREDITS' THEN 25 END) END);
END; $$;

CREATE FUNCTION public.hub_evaluation_runtime_command(p_external_subject TEXT,p_attempt_id UUID,p_command TEXT,p_input JSONB,p_idempotency_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor UUID;v_attempt public.hub_scored_evaluation_attempts%ROWTYPE;v_runtime public.hub_evaluation_runtime%ROWTYPE;
  v_world public.hub_evaluation_worlds%ROWTYPE;v_policy public.hub_account_policies%ROWTYPE;v_account public.sandbox_game_accounts%ROWTYPE;
  v_claim public.hub_idempotency_keys%ROWTYPE;v_fingerprint TEXT;v_result JSONB;v_questions JSONB;v_question JSONB;
  v_code TEXT;v_family TEXT;v_actions JSONB;v_action TEXT;v_sequence INTEGER;v_session UUID;v_customer UUID;v_account_id UUID;
  v_identifier TEXT;v_password TEXT;v_username TEXT;v_pattern TEXT;v_amount NUMERIC;v_correct BOOLEAN:=FALSE;
  v_history JSONB;v_history_ids JSONB;v_before NUMERIC;v_after NUMERIC;v_evidence JSONB;v_results JSONB;
  v_operation public.sandbox_operations%ROWTYPE;v_decision TEXT;
BEGIN
  v_actor:=public.hub_require_active_role(p_external_subject,ARRAY['postulante']);
  SELECT * INTO v_attempt FROM public.hub_scored_evaluation_attempts WHERE id=p_attempt_id AND identity_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_ACCESS_DENIED'; END IF;
  IF jsonb_typeof(v_attempt.settings_snapshot->'fullShift')='object' THEN RETURN public.hub_final_runtime_command(v_actor,p_attempt_id,p_command,p_input,p_idempotency_key);END IF;
  IF p_command='read' THEN RETURN public.hub_evaluation_runtime_view(p_attempt_id); END IF;
  IF p_command IS NULL OR p_command NOT IN ('start','theory','action','history') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('attempt',p_attempt_id,'command',p_command,'input',p_input)::text,'sha256'),'hex');
  INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(v_actor,'evaluation_runtime',p_idempotency_key,v_fingerprint) ON CONFLICT DO NOTHING;
  SELECT * INTO v_claim FROM public.hub_idempotency_keys WHERE identity_id=v_actor AND action_code='evaluation_runtime' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_claim.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT'; END IF;
  IF v_claim.response IS NOT NULL THEN RETURN v_claim.response; END IF;
  IF v_attempt.status<>'in_progress' THEN RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE'; END IF;
  IF v_attempt.expires_at<=now() THEN RAISE EXCEPTION 'ATTEMPT_EXPIRED'; END IF;
  v_actions:=v_attempt.settings_snapshot->'requiredActionCodes';
  IF jsonb_array_length(v_actions)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_actions) code
    WHERE code NOT IN ('CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','ADD_CREDITS','WITHDRAW_CREDITS','REVIEW_TRANSACTION_RECORDS','RESET_PASSWORD_EDIT_INFORMATION',
      'BACKEND_CREATE_ACCOUNT','BACKEND_REFRESH_BALANCE','BACKEND_ADD_CREDITS','BACKEND_WITHDRAW_CREDITS','BACKEND_RESET_PASSWORD','RESOLVE_RECONCILIATION','CUSTOMER_RESPONSE'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_attempt.settings_snapshot->'gameFamilyKeys') family WHERE family<>'orion-stars') THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
  SELECT * INTO v_runtime FROM public.hub_evaluation_runtime WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_command<>'start' THEN RAISE EXCEPTION 'HUB_RUNTIME_NOT_STARTED'; END IF;
    v_questions:='[]';
    FOR v_code IN SELECT jsonb_array_elements_text(v_attempt.settings_snapshot->'theoryItemCodes') LOOP
      SELECT jsonb_build_object('id',id,'code',stable_code,'version',version,'question',question,'choices',choices,'correctOption',correct_option)
        INTO v_question FROM public.hub_theory_question_versions q WHERE stable_code=v_code AND published
          AND (NOT(v_attempt.settings_snapshot ? 'theoryQuestionVersionIds') OR v_attempt.settings_snapshot->'theoryQuestionVersionIds' ? q.id::text)
        ORDER BY version DESC LIMIT 1;
      IF v_question IS NULL THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED'; END IF;
      v_questions:=v_questions||jsonb_build_array(v_question);
    END LOOP;
    IF jsonb_array_length(v_questions)=0 THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED'; END IF;
    INSERT INTO public.hub_evaluation_runtime(attempt_id,theory_snapshot) VALUES(p_attempt_id,v_questions) RETURNING * INTO v_runtime;
    FOR v_family IN SELECT jsonb_array_elements_text(v_attempt.settings_snapshot->'gameFamilyKeys') LOOP
      SELECT p.* INTO v_policy FROM public.hub_account_policies p WHERE p.game='Orion Stars' AND
        (p.id::text=v_attempt.settings_snapshot->>'accountPolicyVersionId' OR NOT(v_attempt.settings_snapshot ? 'accountPolicyVersionId') AND EXISTS(
          SELECT 1 FROM public.hub_activities a WHERE a.content->>'executionKind'='account_id_lab' AND a.content->>'policyVersionId'=p.id::text)) ORDER BY p.version DESC LIMIT 1;
      IF v_policy.id IS NULL THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
      INSERT INTO public.trainee_sessions(trainee_name,status,runtime_mode) VALUES('Hub formal evaluation','assessment','focused_practice') RETURNING id INTO v_session;
      INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(v_session,'AssessmentPlayer',500) RETURNING id INTO v_customer;
      INSERT INTO public.sandbox_game_wallets(session_id,game,balance) VALUES(v_session,'Orion Stars',20000);
      INSERT INTO public.hub_evaluation_worlds(attempt_id,game_family_key,session_id,customer_id,account_policy_id) VALUES(p_attempt_id,v_family,v_session,v_customer,v_policy.id);
    END LOOP;
  END IF;
  IF p_command='theory' THEN
    IF v_runtime.theory_answers<>'{}'::jsonb THEN RAISE EXCEPTION 'HUB_THEORY_ALREADY_SUBMITTED'; END IF;
    IF p_input->'answers' IS NULL OR jsonb_typeof(p_input->'answers')<>'object' THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
    FOR v_question IN SELECT value FROM jsonb_array_elements(v_runtime.theory_snapshot) LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_question->'choices') choice WHERE choice->>'id'=p_input->'answers'->>(v_question->>'code')) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_object_keys(p_input->'answers'))<>jsonb_array_length(v_runtime.theory_snapshot) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
    UPDATE public.hub_evaluation_runtime SET theory_answers=p_input->'answers' WHERE attempt_id=p_attempt_id RETURNING * INTO v_runtime;
  ELSIF p_command IN ('action','history') THEN
    IF v_runtime.action_cursor>=jsonb_array_length(v_actions)*jsonb_array_length(v_attempt.settings_snapshot->'gameFamilyKeys') THEN RAISE EXCEPTION 'HUB_RUNTIME_ACTIONS_COMPLETE'; END IF;
    v_family:=v_attempt.settings_snapshot->'gameFamilyKeys'->>(v_runtime.action_cursor/jsonb_array_length(v_actions));
    v_action:=v_actions->>(v_runtime.action_cursor%jsonb_array_length(v_actions));v_sequence:=v_runtime.action_cursor+1;
    SELECT * INTO v_world FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id AND game_family_key=v_family FOR UPDATE;
    SELECT * INTO v_account FROM public.sandbox_game_accounts WHERE id=v_world.account_id;
    SELECT username INTO v_username FROM public.sandbox_customers WHERE id=v_world.customer_id;
    v_before:=coalesce(v_account.balance,0);
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'amount',amount,'createdAt',created_at) ORDER BY created_at,id),'[]')
      INTO v_history FROM (
        SELECT * FROM public.sandbox_game_history WHERE session_id=v_world.session_id AND game_account_id=v_world.account_id
          AND created_at>=now()-make_interval(days=>coalesce((v_attempt.settings_snapshot->>'historyReviewDays')::integer,7))
        ORDER BY created_at DESC,id DESC LIMIT (v_attempt.settings_snapshot->>'historyRecordLimit')::integer
      ) assigned_history;
    IF p_command='history' THEN
      UPDATE public.hub_evaluation_worlds SET history_read_at=now() WHERE id=v_world.id;
      v_result:=jsonb_build_object('history',v_history);
    ELSE
      v_results:=public.hub_execute_evaluation_action(v_actor,v_world.id,v_action,p_input);
      v_correct:=(v_results->>'isCorrect')::boolean;v_evidence:=v_results->'evidence';
      INSERT INTO public.hub_evaluation_action_evidence(attempt_id,sequence_number,item_code,game_family_key,is_correct,evidence)
        VALUES(p_attempt_id,v_sequence,v_action,v_family,coalesce(v_correct,FALSE),v_evidence);
      UPDATE public.hub_evaluation_runtime SET action_cursor=action_cursor+1 WHERE attempt_id=p_attempt_id RETURNING * INTO v_runtime;
    END IF;
  END IF;
  PERFORM public.hub_prepare_evaluation_task(p_attempt_id);
  IF v_runtime.theory_answers<>'{}'::jsonb AND v_runtime.action_cursor=jsonb_array_length(v_actions)*jsonb_array_length(v_attempt.settings_snapshot->'gameFamilyKeys') THEN
    SELECT jsonb_agg(item) INTO v_results FROM(
      SELECT jsonb_build_object('section','theory','item_code',q->>'code','is_correct',v_runtime.theory_answers->>(q->>'code')=q->>'correctOption','failure_points','[]'::jsonb) item FROM jsonb_array_elements(v_runtime.theory_snapshot) q
      UNION ALL
      SELECT jsonb_build_object('section','practical','item_code',e.item_code,'game_family_key',e.game_family_key,'sequence_number',e.sequence_number,'is_correct',e.is_correct,'failure_points',CASE WHEN e.is_correct THEN '[]'::jsonb ELSE '["Required action evidence did not match"]'::jsonb END)
        FROM public.hub_evaluation_action_evidence e WHERE e.attempt_id=p_attempt_id
    ) results;
    PERFORM public.hub_score_scored_evaluation_attempt(p_attempt_id,v_results);
    UPDATE public.trainee_sessions SET status='completed',ended_at=now() WHERE id IN (SELECT session_id FROM public.hub_evaluation_worlds WHERE attempt_id=p_attempt_id);
  END IF;
  IF v_result IS NULL THEN v_result:=public.hub_evaluation_runtime_view(p_attempt_id); END IF;
  UPDATE public.hub_idempotency_keys SET response=v_result WHERE identity_id=v_actor AND action_code='evaluation_runtime' AND idempotency_key=p_idempotency_key;
  RETURN v_result;
END; $$;

ALTER TABLE public.hub_theory_question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_evaluation_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_evaluation_worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_evaluation_action_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_theory_question_versions,public.hub_evaluation_runtime,public.hub_evaluation_worlds,public.hub_evaluation_action_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_theory_question_versions,public.hub_evaluation_runtime,public.hub_evaluation_worlds,public.hub_evaluation_action_evidence TO service_role;
REVOKE ALL ON FUNCTION public.hub_evaluation_runtime_view(UUID),public.hub_evaluation_runtime_command(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hub_prepare_evaluation_task(UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hub_evaluation_runtime_view(UUID),public.hub_evaluation_runtime_command(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
