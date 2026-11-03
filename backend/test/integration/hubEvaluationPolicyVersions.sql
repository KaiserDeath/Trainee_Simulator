BEGIN;
DO $$
DECLARE trainer UUID:=gen_random_uuid();learner UUID:=gen_random_uuid();second_learner UUID:=gen_random_uuid();course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();enrolment UUID;
  evaluation UUID:='10000000-0000-4000-8000-000000000401';old_policy public.hub_scored_evaluations%ROWTYPE;new_policy public.hub_scored_evaluations%ROWTYPE;
  result JSONB;first_attempt UUID;second_attempt UUID;invalid JSONB;current_revision INTEGER;
BEGIN
  INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(trainer,'policy-trainer'),(learner,'policy-learner'),(second_learner,'policy-second');
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT trainer,id FROM public.hub_roles WHERE code='trainer';
  INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT i,r.id FROM unnest(ARRAY[learner,second_learner]) i CROSS JOIN public.hub_roles r WHERE r.code='postulante';
  INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'policy-fixture','Policy fixture');
  INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'policy-module',1,'Policy prerequisite');
  INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course),(second_learner,course);
  INSERT INTO public.hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at)
    SELECT id,course,module,'completed',now(),now() FROM public.hub_enrolments WHERE course_id=course;
  UPDATE public.hub_scored_evaluations SET publication_status='published',is_provisional=FALSE,prerequisite_module_ids=ARRAY[module],theory_item_codes=ARRAY['verification-first'] WHERE id=evaluation;
  old_policy:=public.hub_effective_evaluation(evaluation);current_revision:=old_policy.revision;
  result:=public.hub_start_scored_evaluation_attempt('policy-learner',evaluation,'policy-before');first_attempt:=(result->>'attemptId')::uuid;
  result:=public.hub_publish_theory_question('policy-trainer','verification-first',1,'Which exact evidence must be checked before changing credit?',
    '[{"id":"verify","label":"The verified customer, licensed access, amount and histories"},{"id":"name","label":"Only the display name"}]','verify','Existing verification-first operator requirements','Clarify the exact evidence required');
  BEGIN
    PERFORM public.hub_publish_theory_question('policy-trainer','verification-first',1,'A stale editor should not replace this question',
      '[{"id":"yes","label":"Yes"},{"id":"no","label":"No"}]','yes','Version conflict fixture','Stale editor must be rejected');
    RAISE EXCEPTION 'stale question editor published';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_QUESTION_VERSION_CONFLICT' THEN RAISE;END IF;END;
  BEGIN
    PERFORM public.hub_publish_theory_question('policy-trainer','bad-shape',0,'This malformed choice must be rejected',
      '[{"id":"yes","label":{"html":"unsafe"}},{"id":"no","label":"No"}]','yes','Malformed choice fixture','Reject a non-text label');
    RAISE EXCEPTION 'malformed question choice published';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_INVALID_INPUT' THEN RAISE;END IF;END;
  result:=public.hub_evaluation_runtime_command('policy-learner',first_attempt,'start','{}','question-pin-before');
  IF NOT EXISTS(SELECT 1 FROM public.hub_evaluation_runtime r CROSS JOIN LATERAL jsonb_array_elements(r.theory_snapshot) q WHERE r.attempt_id=first_attempt AND (q->>'version')::integer=1) THEN RAISE EXCEPTION 'question changed between starting and opening assessment';END IF;
  result:=public.hub_publish_evaluation_policy('policy-trainer',evaluation,current_revision,'{"duration_minutes":45}','Allow additional evaluation time for future learners');
  new_policy:=public.hub_effective_evaluation(evaluation);
  IF new_policy.duration_minutes<>45 OR new_policy.revision<>current_revision+1 THEN RAISE EXCEPTION 'future policy was not published';END IF;
  IF (SELECT duration_minutes FROM public.hub_scored_evaluations WHERE id=evaluation)<>old_policy.duration_minutes THEN RAISE EXCEPTION 'immutable root policy rewritten';END IF;
  result:=public.hub_start_scored_evaluation_attempt('policy-second',evaluation,'policy-after');second_attempt:=(result->>'attemptId')::uuid;
  result:=public.hub_evaluation_runtime_command('policy-second',second_attempt,'start','{}','question-pin-after');
  IF NOT EXISTS(SELECT 1 FROM public.hub_evaluation_runtime r CROSS JOIN LATERAL jsonb_array_elements(r.theory_snapshot) q WHERE r.attempt_id=second_attempt AND (q->>'version')::integer=2) THEN RAISE EXCEPTION 'future attempt missed the new question version';END IF;
  IF (SELECT settings_snapshot->>'durationMinutes' FROM public.hub_scored_evaluation_attempts WHERE id=first_attempt)<>'30'
    OR (SELECT settings_snapshot->>'durationMinutes' FROM public.hub_scored_evaluation_attempts WHERE id=second_attempt)<>'45' THEN RAISE EXCEPTION 'policy revision changed an old attempt or missed the future attempt';END IF;
  BEGIN
    PERFORM public.hub_publish_evaluation_policy('policy-trainer',evaluation,current_revision,'{"duration_minutes":50}','Outdated editor attempts publication');
    RAISE EXCEPTION 'stale editor overwrote policy';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_EVALUATION_REVISION_CONFLICT' THEN RAISE; END IF; END;
  FOR invalid IN SELECT value FROM jsonb_array_elements('[{"duration_minutes":null},{"max_attempts_per_set":4},{"theory_weight":0,"practical_weight":100},{"theory_item_codes":["missing-question"]},{"practical_item_weights":{}}]') LOOP
    BEGIN
      PERFORM public.hub_publish_evaluation_policy('policy-trainer',evaluation,new_policy.revision,invalid,'Invalid configuration must be rejected');
      RAISE EXCEPTION 'invalid policy published';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid policy published' THEN RAISE;END IF;END;
  END LOOP;
  BEGIN
    PERFORM public.hub_publish_evaluation_policy('policy-learner',evaluation,new_policy.revision,'{}','Learner cannot publish assessment rules');
    RAISE EXCEPTION 'learner published policy';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
  BEGIN
    UPDATE public.hub_evaluation_policy_versions SET rationale='tamper' WHERE evaluation_id=evaluation;
    RAISE EXCEPTION 'published history mutated';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='published history mutated' THEN RAISE;END IF;END;
  IF has_table_privilege('authenticated','public.hub_evaluation_policy_versions','INSERT') OR has_table_privilege('service_role','public.hub_evaluation_policy_heads','UPDATE') THEN RAISE EXCEPTION 'policy publication bypass available';END IF;
END; $$;
ROLLBACK;
