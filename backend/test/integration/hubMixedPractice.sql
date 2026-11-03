BEGIN;
DO $$
DECLARE learner UUID:=gen_random_uuid();other_learner UUID:=gen_random_uuid();course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();activity UUID:=gen_random_uuid();enrolment UUID;
 view JSONB;input JSONB;result JSONB;replay JSONB;run INTEGER;first_run UUID;completed_at_before TIMESTAMPTZ;attempts_before INTEGER;
BEGIN
 INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(learner,'mixed-learner'),(other_learner,'mixed-other');
 INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT i,r.id FROM unnest(ARRAY[learner,other_learner]) i CROSS JOIN public.hub_roles r WHERE r.code='postulante';
 INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'mixed-fixture','Mixed fixture');
 INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'mixed-fixture',1,'Mixed practice');
 INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title,content) VALUES(activity,module,'mixed-fixture',1,'quick_simulation','Mixed practice','{"executionKind":"mixed_practice","policyStatus":"approved"}');
 INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course) RETURNING id INTO enrolment;
 INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(other_learner,course);
 UPDATE public.hub_assessment_settings SET minimum_operations=1,maximum_operations=1,operation_types=ARRAY['ADD CREDITS'],advanced_enabled=FALSE;
 view:=public.hub_mixed_command('mixed-learner',activity,'read','{}',NULL);
 IF view->>'status'<>'not_started' THEN RAISE EXCEPTION 'fresh practice already started';END IF;
 FOR run IN 1..5 LOOP
   view:=public.hub_mixed_command('mixed-learner',activity,'start','{}','mixed-start-'||run);
   IF run=1 THEN first_run:=(view->>'runId')::uuid;ELSE IF view->>'runId'=first_run::text THEN RAISE EXCEPTION 'new practice run reused the previous identity';END IF;END IF;
   BEGIN
     PERFORM public.hub_complete_activity('mixed-learner',activity,'{"serverVerified":true}','mixed-forged-'||run);
     IF run<3 THEN RAISE EXCEPTION 'forged mixed completion accepted';END IF;
   EXCEPTION WHEN OTHERS THEN IF run<3 AND SQLERRM<>'HUB_ACTIVITY_BLOCKED' THEN RAISE;END IF;END;
   input:=jsonb_build_object('runId',view->>'runId','worldId',view#>>'{task,worldId}','stage',1,'actionCode','ADD_CREDITS','identifier','OS_Assess123','amount',CASE WHEN run=1 THEN 40 ELSE 50 END);
   result:=public.hub_mixed_command('mixed-learner',activity,'action',input,'mixed-game-'||run);
   replay:=public.hub_mixed_command('mixed-learner',activity,'action',input,'mixed-game-'||run);
   IF replay<>result THEN RAISE EXCEPTION 'practice retry changed its result';END IF;
   BEGIN
     PERFORM public.hub_mixed_command('mixed-learner',activity,'action',input,'mixed-stale-'||run);
     RAISE EXCEPTION 'stale game action advanced the Backend stage';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_PRACTICE_CONFLICT' THEN RAISE;END IF;END;
   input:=jsonb_build_object('runId',result->>'runId','worldId',result#>>'{task,worldId}','stage',2,'actionCode','BACKEND_ADD_CREDITS','decision','APPROVED','reason','Verified the exact game movement');
   view:=public.hub_mixed_command('mixed-learner',activity,'action',input,'mixed-backend-'||run);
   IF run=1 THEN
     IF view->>'result'<>'false' OR EXISTS(SELECT 1 FROM public.hub_module_progress WHERE enrolment_id=enrolment AND status='completed') THEN RAISE EXCEPTION 'incorrect practice completed learning';END IF;
   ELSE
     IF view->>'result'<>'true' THEN RAISE EXCEPTION 'correct mixed practice failed: %',view;END IF;
     IF run=2 THEN
       SELECT completed_at INTO completed_at_before FROM public.hub_module_progress WHERE enrolment_id=enrolment AND module_id=module AND status='completed';
       IF completed_at_before IS NULL THEN RAISE EXCEPTION 'correct practice did not complete learning';END IF;
       SELECT count(*) INTO attempts_before FROM public.hub_attempts WHERE module_id=module;
     ELSE
       IF (SELECT completed_at FROM public.hub_module_progress WHERE enrolment_id=enrolment AND module_id=module) IS DISTINCT FROM completed_at_before
         OR (SELECT count(*) FROM public.hub_attempts WHERE module_id=module)<>attempts_before THEN RAISE EXCEPTION 'replay rewrote original learning completion';END IF;
     END IF;
   END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.hub_mixed_runs WHERE identity_id=learner)<>5 OR EXISTS(SELECT 1 FROM public.hub_scored_evaluation_attempts WHERE identity_id=learner) THEN RAISE EXCEPTION 'practice was limited or consumed formal attempts';END IF;
 view:=public.hub_mixed_command('mixed-learner',activity,'start','{}','mixed-abandon-start');
 view:=public.hub_mixed_command('mixed-learner',activity,'abandon',jsonb_build_object('runId',view->>'runId'),'mixed-abandon');
 IF view->>'status'<>'abandoned' THEN RAISE EXCEPTION 'practice abandonment not retained';END IF;
 IF (SELECT count(*) FROM public.hub_mixed_stage_evidence WHERE run_id=first_run)<>2 THEN RAISE EXCEPTION 'earlier failed practice evidence changed';END IF;
 IF has_table_privilege('authenticated','public.hub_mixed_stage_evidence','SELECT') THEN RAISE EXCEPTION 'browser role reads private practice evidence';END IF;
END; $$;
ROLLBACK;
