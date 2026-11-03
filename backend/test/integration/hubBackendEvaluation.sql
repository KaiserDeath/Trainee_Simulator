BEGIN;
DO $$
DECLARE learner UUID:=gen_random_uuid();course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();enrolment UUID;attempt UUID;view JSONB;input JSONB;action TEXT;step INTEGER:=0;
  actions TEXT[]:=ARRAY['CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','BACKEND_REFRESH_BALANCE','ADD_CREDITS','BACKEND_ADD_CREDITS','WITHDRAW_CREDITS','BACKEND_WITHDRAW_CREDITS','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD'];
  weights JSONB;world public.hub_evaluation_worlds%ROWTYPE;run INTEGER;
BEGIN
  INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(learner,'backend-evaluation-learner');
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT learner,id FROM public.hub_roles WHERE code='postulante';
  INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'backend-runtime-fixture','Backend runtime');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'backend-runtime-fixture',1,'Backend runtime');
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course) RETURNING id INTO enrolment;
  INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at) VALUES(enrolment,course,module,'completed',now(),now());
  SELECT jsonb_object_agg(code,CASE code WHEN 'BACKEND_RESET_PASSWORD' THEN 10 ELSE 7 END) INTO weights FROM unnest(actions) code;
  UPDATE public.hub_game_family_adapters SET adapter_status='verified',verified_at=now() WHERE stable_key='orion-stars';
  UPDATE public.hub_scored_evaluations SET publication_status='published',is_provisional=FALSE,prerequisite_module_ids=ARRAY[module],prerequisite_evaluation_ids='{}',
    selected_game_family_keys=ARRAY['orion-stars'],theory_item_codes=ARRAY['verification-first'],required_action_codes=actions,practical_item_weights=weights
    WHERE stable_code='checkpoint-operations';
  FOR run IN 1..2 LOOP
  step:=0;
  view:=public.hub_start_scored_evaluation_attempt('backend-evaluation-learner','10000000-0000-4000-8000-000000000402','backend-runtime-attempt-'||run);attempt:=(view->>'attemptId')::uuid;
  view:=public.hub_evaluation_runtime_command('backend-evaluation-learner',attempt,'start','{}','backend-runtime-start-'||run);
  view:=public.hub_evaluation_runtime_command('backend-evaluation-learner',attempt,'theory','{"answers":{"verification-first":"verify"}}','backend-runtime-theory-'||run);
  FOREACH action IN ARRAY actions LOOP
    step:=step+1;input:=jsonb_build_object('actionCode',action,'identifier','OS_Assess123','kiosk','OrionStars','decision','APPROVED','reason','Verified the assigned player and histories');
    IF action IN ('CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT') THEN input:=input||'{"password":"backend-runtime-private"}'::jsonb;
    ELSIF action IN ('RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD') THEN input:=input||'{"password":"backend-runtime-reset-private"}'::jsonb;
    ELSIF action IN ('VERIFY_BALANCE','BACKEND_REFRESH_BALANCE') THEN input:=input||'{"credit":0}'::jsonb;
    ELSIF action='ADD_CREDITS' THEN input:=input||'{"amount":50}'::jsonb;
    ELSIF action='WITHDRAW_CREDITS' THEN input:=input||'{"amount":25}'::jsonb;END IF;
    IF run=2 AND action='BACKEND_CREATE_ACCOUNT' THEN input:=input||'{"kiosk":"WrongKiosk","isCorrect":true}'::jsonb;END IF;
    view:=public.hub_evaluation_runtime_command('backend-evaluation-learner',attempt,'action',input,'backend-runtime-action-'||run||'-'||step);
  END LOOP;
  IF run=2 THEN
    IF (view->>'score')::numeric<>93 THEN RAISE EXCEPTION 'wrong kiosk/forged verdict did not preserve server scoring: %',view;END IF;
    CONTINUE;
  END IF;
  IF (view->>'score')::numeric<>100 THEN RAISE EXCEPTION 'correct Backend sequence not successful: %, failures: %',view,(SELECT jsonb_agg(item_code) FROM public.hub_scored_evaluation_item_results WHERE attempt_id=attempt AND NOT is_correct); END IF;
  SELECT * INTO world FROM public.hub_evaluation_worlds WHERE attempt_id=attempt;
  IF (SELECT count(*) FROM public.sandbox_operations WHERE session_id=world.session_id AND status='APPROVED' AND is_correct)<>5 THEN RAISE EXCEPTION 'Backend operation evidence incomplete'; END IF;
  IF (SELECT balance FROM public.sandbox_customers WHERE id=world.customer_id)<>475 OR (SELECT balance FROM public.sandbox_game_accounts WHERE id=world.account_id)<>25 THEN RAISE EXCEPTION 'Backend settlement did not preserve separate ledgers'; END IF;
  IF EXISTS(SELECT 1 FROM public.hub_operation_evidence WHERE session_id=world.session_id AND snapshot::text LIKE '%backend-runtime-private%') THEN RAISE EXCEPTION 'private credential in retained evidence'; END IF;
  END LOOP;
END; $$;
ROLLBACK;
