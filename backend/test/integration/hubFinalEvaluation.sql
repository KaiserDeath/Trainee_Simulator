BEGIN;
DO $$
DECLARE course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();learner UUID;enrolment UUID;attempt UUID;expired UUID;attempt_set UUID;
  kind TEXT;subject TEXT;view JSONB;input JSONB;result JSONB;replay JSONB;history JSONB;action TEXT;run INTEGER;step INTEGER;count_operations INTEGER;decision TEXT;
  types TEXT[]:=ARRAY['CREATE ACCOUNT','REFRESH BALANCE','ADD CREDITS','WITHDRAW CREDITS','RESET PASSWORD'];
BEGIN
  INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'final-runtime-fixture','Final runtime');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'final-runtime-fixture',1,'Final prerequisite');
  UPDATE public.hub_scored_evaluations SET publication_status='published',is_provisional=FALSE,prerequisite_module_ids=ARRAY[module],prerequisite_evaluation_ids='{}',theory_item_codes=ARRAY['verification-first'] WHERE stable_code='final-pretraining-readiness';
  FOR run IN 1..8 LOOP
    learner:=gen_random_uuid();subject:='final-runtime-'||run;step:=0;
    INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(learner,subject);
    INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT learner,id FROM public.hub_roles WHERE code='postulante';
    INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course) RETURNING id INTO enrolment;
    INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at) VALUES(enrolment,course,module,'completed',now(),now());
    kind:=CASE WHEN run<=5 THEN types[run] WHEN run=6 THEN 'CREATE ACCOUNT' ELSE 'ADD CREDITS' END;
    UPDATE public.hub_assessment_settings SET minimum_operations=CASE WHEN run=7 THEN 2 ELSE 1 END,maximum_operations=CASE WHEN run=7 THEN 6 ELSE 1 END,operation_types=CASE WHEN run=7 THEN types ELSE ARRAY[kind] END,advanced_enabled=(run=8);
    IF run=8 THEN PERFORM setseed(0.04);END IF;
    view:=public.hub_start_scored_evaluation_attempt(subject,'10000000-0000-4000-8000-000000000404','final-start-'||run);attempt:=(view->>'attemptId')::uuid;
    count_operations:=jsonb_array_length(view#>'{settings,fullShift,operations}');
    IF run=8 AND view#>>'{settings,fullShift,operations,0}'<>'RECONCILIATION' THEN RAISE EXCEPTION 'advanced fixture did not select reconciliation';END IF;
    IF run<7 AND count_operations<>1 OR run=7 AND count_operations NOT BETWEEN 2 AND 6 THEN RAISE EXCEPTION 'final workload outside captured limits';END IF;
    -- Changes after the clock starts cannot alter the already assigned plan.
    UPDATE public.hub_assessment_settings SET minimum_operations=6,maximum_operations=6,operation_types=ARRAY['RESET PASSWORD'];
    view:=public.hub_evaluation_runtime_command(subject,attempt,'start','{}','final-open-'||run);
    IF (view->>'totalActions')::integer<>count_operations*2 THEN RAISE EXCEPTION 'started final workload changed before opening';END IF;
    view:=public.hub_evaluation_runtime_command(subject,attempt,'theory','{"answers":{"verification-first":"verify"}}','final-theory-'||run);
    WHILE view->'task'<>'null'::jsonb LOOP
      step:=step+1;IF step>100 THEN RAISE EXCEPTION 'final runtime did not terminate';END IF;
      action:=view#>>'{task,action}';
      input:=jsonb_build_object('actionCode',action,'identifier',coalesce(view#>>'{task,identifier}','OS_Assess123'),'kiosk','OrionStars','decision','APPROVED','reason','Checked the assigned operation and game evidence');
      IF action IN ('CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD') THEN input:=input||'{"password":"final-runtime-secret"}'::jsonb;END IF;
      IF action IN ('ADD_CREDITS','WITHDRAW_CREDITS') THEN input:=input||jsonb_build_object('amount',view#>'{task,amount}');END IF;
      IF action IN ('VERIFY_BALANCE','BACKEND_REFRESH_BALANCE') THEN input:=input||jsonb_build_object('credit',view#>'{task,credit}');END IF;
      IF action='RESOLVE_RECONCILIATION' THEN
        history:=public.hub_evaluation_runtime_command(subject,attempt,'history','{}','final-history-'||run||'-'||step);
        SELECT CASE WHEN bot_applied THEN 'APPROVED' ELSE 'CANCELLED' END INTO decision FROM public.sandbox_operations WHERE id=(view#>>'{task,operation,id}')::uuid;
        input:=input||jsonb_build_object('decision',decision);
      ELSIF action='CUSTOMER_RESPONSE' THEN input:=input||jsonb_build_object('responseCode','recorded-outcome','reference',view#>>'{task,operation,id}','credit',view#>'{task,customerBalance}');END IF;
      IF run=6 AND action='CREATE_ACCOUNT' THEN input:=input||'{"identifier":"wrong-structure","isCorrect":true}'::jsonb;END IF;
      view:=public.hub_evaluation_runtime_command(subject,attempt,'action',input,'final-action-'||run||'-'||step);
      replay:=public.hub_evaluation_runtime_command(subject,attempt,'action',input,'final-action-'||run||'-'||step);
      IF replay<>view THEN RAISE EXCEPTION 'final action retry changed result';END IF;
      IF view->>'status'<>'in_progress' THEN EXIT;END IF;
      IF view ? 'score' OR view::text LIKE '%isCorrect%' OR view::text LIKE '%correctOption%' THEN RAISE EXCEPTION 'final intermediate answer key exposed';END IF;
    END LOOP;
    IF run=6 THEN
      IF (view->>'score')::numeric<>20 THEN RAISE EXCEPTION 'wrong account structure forged a final pass: %',view;END IF;
    ELSIF (view->>'score')::numeric<>100 THEN RAISE EXCEPTION 'correct final workload did not pass: %, failures: %',view,(SELECT jsonb_agg(item_code) FROM public.hub_scored_evaluation_item_results WHERE attempt_id=attempt AND NOT is_correct);END IF;
    IF (SELECT count(*) FROM public.hub_final_stage_evidence WHERE attempt_id=attempt)<>2*count_operations THEN RAISE EXCEPTION 'final stage evidence incomplete or duplicated';END IF;
    IF EXISTS(SELECT 1 FROM public.hub_final_stage_evidence WHERE attempt_id=attempt AND evidence::text LIKE '%final-runtime-secret%') THEN RAISE EXCEPTION 'password retained in final evidence';END IF;
  END LOOP;
  SELECT attempt_set_id INTO attempt_set FROM public.hub_scored_evaluation_attempts WHERE id=attempt;
  INSERT INTO public.hub_scored_evaluation_attempts(attempt_set_id,evaluation_id,identity_id,start_idempotency_key,attempt_in_set,settings_snapshot,started_at,expires_at)
    SELECT attempt_set_id,evaluation_id,identity_id,'expired-final-fixture',2,settings_snapshot,now()-interval '2 minutes',now()-interval '1 minute' FROM public.hub_scored_evaluation_attempts WHERE id=attempt RETURNING id INTO expired;
  BEGIN
    PERFORM public.hub_evaluation_runtime_command(subject,expired,'start','{}','expired-final-open');
    RAISE EXCEPTION 'expired final created a world';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ATTEMPT_EXPIRED' THEN RAISE;END IF;END;
  PERFORM public.hub_expire_scored_evaluation_attempts();
  IF NOT EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts WHERE id=expired AND score=0 AND completion_reason='timed_out') THEN RAISE EXCEPTION 'expired final not recorded';END IF;
END; $$;
ROLLBACK;
