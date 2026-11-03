BEGIN;
DO $$
DECLARE learner UUID:=gen_random_uuid();trainer UUID:=gen_random_uuid();course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();
  enrolment UUID; evaluation UUID:='10000000-0000-4000-8000-000000000401';attempt UUID;view JSONB;replay JSONB;history JSONB;history_ids JSONB;
  actions TEXT[]:=ARRAY['CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','ADD_CREDITS','WITHDRAW_CREDITS','REVIEW_TRANSACTION_RECORDS','RESET_PASSWORD_EDIT_INFORMATION'];
  action TEXT;input JSONB;result JSONB;run INTEGER;step INTEGER;answers JSONB;
  official_learner UUID:=gen_random_uuid();official_enrolment UUID;official_attempt UUID;official_results JSONB;
BEGIN
  INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(learner,'runtime-learner'),(trainer,'runtime-trainer');
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT learner,id FROM public.hub_roles WHERE code='postulante';
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT trainer,id FROM public.hub_roles WHERE code='trainer';
  INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'runtime-course','Runtime course');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'runtime-module',1,'Runtime prerequisite');
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course) RETURNING id INTO enrolment;
  INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at) VALUES(enrolment,course,module,'completed',now(),now());
  UPDATE public.hub_game_family_adapters SET adapter_status='verified',verified_at=now() WHERE stable_key='orion-stars';
  UPDATE public.hub_scored_evaluations SET publication_status='published',is_provisional=FALSE,
    selected_game_family_keys=ARRAY['orion-stars'],prerequisite_module_ids=ARRAY[module],
    theory_item_codes=ARRAY['verification-first','no-duplicate-credit','exact-player','credential-evidence'],required_action_codes=actions,
    practical_item_weights='{"CREATE_ACCOUNT":15,"SEARCH_USER":10,"VERIFY_BALANCE":10,"ADD_CREDITS":15,"WITHDRAW_CREDITS":15,"REVIEW_TRANSACTION_RECORDS":10,"RESET_PASSWORD_EDIT_INFORMATION":5}'
    WHERE id=evaluation;
  IF (SELECT count(*) FROM public.hub_modules WHERE course_id='10000000-0000-4000-8000-000000000001' AND position BETWEEN 1 AND 15)<>15 THEN RAISE EXCEPTION 'expanded curriculum incomplete'; END IF;
  INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(official_learner,'runtime-official');
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT official_learner,id FROM public.hub_roles WHERE code='postulante';
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(official_learner,'10000000-0000-4000-8000-000000000001') RETURNING id INTO official_enrolment;
  BEGIN
    INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at)
    VALUES(official_enrolment,'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000112','completed',now(),now());
    RAISE EXCEPTION 'checkpoint completed without official evidence';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_OFFICIAL_EVALUATION_REQUIRED' THEN RAISE; END IF; END;
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(official_learner,course) RETURNING id INTO enrolment;
  INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at) VALUES(enrolment,course,module,'completed',now(),now());
  FOR run IN 1..3 LOOP
    result:=public.hub_start_scored_evaluation_attempt('runtime-learner',evaluation,'runtime-attempt-'||run);
    attempt:=(result->>'attemptId')::uuid;
    view:=public.hub_evaluation_runtime_command('runtime-learner',attempt,'start','{}','runtime-start-'||run);
    IF view::text LIKE '%correctOption%' OR view::text LIKE '%isCorrect%' OR jsonb_array_length(view->'questions')<>4 THEN RAISE EXCEPTION 'theory key exposed or questions missing'; END IF;
    answers:=CASE WHEN run=1 THEN '{"verification-first":"verify","no-duplicate-credit":"evidence","exact-player":"exact","credential-evidence":"provided"}'::jsonb
      ELSE '{"verification-first":"name","no-duplicate-credit":"again","exact-player":"similar","credential-evidence":"literal"}'::jsonb END;
    view:=public.hub_evaluation_runtime_command('runtime-learner',attempt,'theory',jsonb_build_object('answers',answers),'runtime-theory-'||run);
    IF view ? 'score' OR view::text LIKE '%correctOption%' OR view::text LIKE '%is_correct%' THEN RAISE EXCEPTION 'intermediate failure evidence exposed'; END IF;
    step:=0;
    FOREACH action IN ARRAY actions LOOP
      step:=step+1;input:=jsonb_build_object('actionCode',action,'identifier','OS_Assess123','isCorrect',TRUE);
      IF action='CREATE_ACCOUNT' THEN input:=input||'{"password":"runtime-password-private"}'::jsonb;
      ELSIF action='SEARCH_USER' AND run=2 THEN input:=input||'{"identifier":"wrong-player","validation":{"correct":true}}'::jsonb;
      ELSIF action='VERIFY_BALANCE' THEN input:=input||'{"credit":0}'::jsonb;
      ELSIF action='ADD_CREDITS' THEN input:=input||'{"amount":50}'::jsonb;
      ELSIF action='WITHDRAW_CREDITS' THEN input:=input||'{"amount":25}'::jsonb;
      ELSIF action='REVIEW_TRANSACTION_RECORDS' THEN
        history:=public.hub_evaluation_runtime_command('runtime-learner',attempt,'history','{}','runtime-history-'||run);
        SELECT jsonb_agg(item->'id') INTO history_ids FROM jsonb_array_elements(history->'history') item;
        input:=input||jsonb_build_object('historyIds',history_ids);
      ELSIF action='RESET_PASSWORD_EDIT_INFORMATION' THEN input:=input||'{"password":"runtime-reset-private"}'::jsonb;
      END IF;
      view:=public.hub_evaluation_runtime_command('runtime-learner',attempt,'action',input,'runtime-action-'||run||'-'||step);
      replay:=public.hub_evaluation_runtime_command('runtime-learner',attempt,'action',input,'runtime-action-'||run||'-'||step);
      IF replay<>view THEN RAISE EXCEPTION 'assessment retry changed result'; END IF;
      IF step<7 AND (view ? 'score' OR view::text LIKE '%isCorrect%') THEN RAISE EXCEPTION 'action-level failure detail exposed'; END IF;
    END LOOP;
    IF run=1 THEN
      IF (view->>'score')::numeric<>100 THEN RAISE EXCEPTION 'correct assessment not 100: %',view; END IF;
      -- Exercise the official-result projection independently of runtime execution.
      SELECT jsonb_agg(jsonb_build_object('section',section,'item_code',item_code,'game_family_key',game_family_key,'sequence_number',sequence_number,'is_correct',is_correct,'failure_points',failure_points))
        INTO official_results FROM public.hub_scored_evaluation_item_results WHERE attempt_id=attempt;
      result:=public.hub_start_scored_evaluation_attempt('runtime-official',evaluation,'runtime-official-start');official_attempt:=(result->>'attemptId')::uuid;
      PERFORM public.hub_score_scored_evaluation_attempt(official_attempt,official_results);
      IF EXISTS(SELECT 1 FROM public.hub_module_progress WHERE enrolment_id=official_enrolment AND status='completed') THEN RAISE EXCEPTION 'unsubmitted score completed checkpoint'; END IF;
      PERFORM public.hub_submit_scored_evaluation_attempt('runtime-official',official_attempt);
      IF NOT EXISTS(SELECT 1 FROM public.hub_module_progress WHERE enrolment_id=official_enrolment AND module_id='10000000-0000-4000-8000-000000000112' AND status='completed') THEN RAISE EXCEPTION 'official success did not complete checkpoint'; END IF;
    END IF;
    IF run=2 AND (view->>'score')::numeric>=100 THEN RAISE EXCEPTION 'browser correctness forged a passing result'; END IF;
    IF run=3 AND (view->>'status'<>'submitted' OR (view->>'score')::numeric<>80) THEN RAISE EXCEPTION 'third attempt not automatically submitted: %',view; END IF;
    IF EXISTS(SELECT 1 FROM public.hub_evaluation_action_evidence WHERE attempt_id=attempt AND (evidence::text LIKE '%runtime-password-private%' OR evidence::text LIKE '%runtime-reset-private%')) THEN RAISE EXCEPTION 'password literal leaked to evaluation evidence'; END IF;
    IF (SELECT count(*) FROM public.hub_evaluation_action_evidence WHERE attempt_id=attempt)<>7 THEN RAISE EXCEPTION 'practical action evidence incomplete'; END IF;
  END LOOP;
  BEGIN
    PERFORM public.hub_start_scored_evaluation_attempt('runtime-learner',evaluation,'runtime-fourth');
    RAISE EXCEPTION 'fourth attempt unexpectedly started';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'EVALUATION_REOPEN_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.hub_reopen_scored_evaluation('runtime-trainer',evaluation,learner,'Additional practice and reassessment required');
  IF (SELECT count(*) FROM public.hub_scored_evaluation_attempts WHERE evaluation_id=evaluation AND identity_id=learner)<>3 THEN RAISE EXCEPTION 'reopening rewrote history'; END IF;
  BEGIN
    PERFORM public.hub_evaluation_runtime_command('runtime-trainer',attempt,'read','{}',NULL);
    RAISE EXCEPTION 'staff performed learner runtime read';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE; END IF; END;
  IF has_table_privilege('anon','public.hub_theory_question_versions','SELECT') OR has_table_privilege('authenticated','public.hub_evaluation_action_evidence','SELECT') THEN RAISE EXCEPTION 'browser database role has private assessment access'; END IF;
END; $$;
ROLLBACK;
