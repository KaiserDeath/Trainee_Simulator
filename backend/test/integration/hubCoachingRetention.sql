-- Disposable local/recovered databases only. All records and age changes roll back.
BEGIN;
CREATE FUNCTION pg_temp.age_coaching(p_note UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE 'SET LOCAL session_replication_role=replica';
 UPDATE public.hub_coaching_notes SET created_at=now()-interval '3 years',retention_until=now()-interval '1 year' WHERE id=p_note;
 UPDATE public.hub_coaching_note_revisions SET created_at=now()-interval '3 years' WHERE note_id=p_note;
 EXECUTE 'SET LOCAL session_replication_role=origin';
END; $$;
CREATE FUNCTION pg_temp.retention_denied(p_actor TEXT,p_learner UUID,p_command TEXT,p_target UUID,p_error TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
   PERFORM public.hub_coaching_retention_command(p_actor,p_learner,p_command,p_target,'Isolated retention verification',gen_random_uuid()::text);
   RAISE EXCEPTION 'Unexpected retention success';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>p_error THEN RAISE;END IF;END;
END; $$;
DO $$
DECLARE a UUID:=gen_random_uuid();b UUID:=gen_random_uuid();learner UUID:=gen_random_uuid();other UUID:=gen_random_uuid();rrhh UUID:=gen_random_uuid();admin UUID:=gen_random_uuid();
 course UUID:=gen_random_uuid();module UUID:=gen_random_uuid();activity UUID:=gen_random_uuid();attempt UUID;note UUID;unrelated UUID;recent UUID;open_note UUID;linked UUID;stale UUID;
 result JSONB;preview JSONB;request JSONB;replay JSONB;hold JSONB;approval JSONB;second JSONB;i INTEGER;
BEGIN
 INSERT INTO public.hub_identities(id,external_subject_reference) VALUES(a,'retention-a'),(b,'retention-b'),(learner,'retention-learner'),(other,'retention-other'),(rrhh,'retention-rrhh'),(admin,'retention-admin');
 INSERT INTO public.hub_role_assignments(identity_id,role_id) SELECT i.id,r.id FROM public.hub_identities i CROSS JOIN public.hub_roles r WHERE
   (i.id IN(a,b) AND r.code='trainer') OR(i.id IN(learner,other) AND r.code='postulante') OR(i.id=rrhh AND r.code='rrhh') OR(i.id=admin AND r.code='admin');
 INSERT INTO public.hub_courses(id,stable_code,title) VALUES(course,'retention-fixture','Retention fixture');
 INSERT INTO public.hub_modules(id,course_id,stable_code,position,title) VALUES(module,course,'linked',1,'Linked evidence');
 INSERT INTO public.hub_activities(id,module_id,stable_code,position,activity_type,title) VALUES(activity,module,'article',1,'article','Retained article');
 INSERT INTO public.hub_enrolments(identity_id,course_id) VALUES(learner,course);
 PERFORM public.hub_complete_activity('retention-learner',activity,'{}','retention-linked-completion');
 SELECT id INTO attempt FROM public.hub_attempts WHERE module_id=module;

 result:=public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'PRIVATE_DISPOSAL_TEXT','closed',NULL,'retention-original');note:=(result->'note'->>'id')::uuid;
 PERFORM pg_temp.age_coaching(note);
 unrelated:=(public.hub_save_coaching_note('retention-a',other,NULL,NULL,0,'Unrelated private note','closed',NULL,'retention-other-note')->'note'->>'id')::uuid;
 PERFORM pg_temp.age_coaching(unrelated);
 recent:=(public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'Old root','closed',NULL,'retention-recent-root')->'note'->>'id')::uuid;
 PERFORM pg_temp.age_coaching(recent);
 PERFORM public.hub_save_coaching_note('retention-a',learner,recent,NULL,1,'A recent closed revision must remain','closed',NULL,'retention-recent-revision');
 IF (SELECT retention_until FROM public.hub_coaching_retention_deadlines WHERE id=recent)<now()+interval '23 months' THEN RAISE EXCEPTION 'Latest revision did not extend effective retention';END IF;
 IF (public.hub_coaching_disposal_state(recent)->>'eligible')::boolean THEN RAISE EXCEPTION 'Recent revision eligible too early';END IF;
 open_note:=(public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'Unresolved case','open',NULL,'retention-open')->'note'->>'id')::uuid;PERFORM pg_temp.age_coaching(open_note);
 linked:=(public.hub_save_coaching_note('retention-a',learner,NULL,attempt,0,'Linked recent attempt','closed',NULL,'retention-linked')->'note'->>'id')::uuid;PERFORM pg_temp.age_coaching(linked);
 IF NOT(public.hub_coaching_disposal_state(linked)->'blockers' ? 'linked_attempt_protected') THEN RAISE EXCEPTION 'Linked attempt not protected';END IF;
 PERFORM pg_temp.retention_denied('retention-a',learner,'request',recent,'HUB_RETENTION_PROTECTED');
 PERFORM pg_temp.retention_denied('retention-a',learner,'request',open_note,'HUB_RETENTION_PROTECTED');
 PERFORM pg_temp.retention_denied('retention-a',learner,'request',linked,'HUB_RETENTION_PROTECTED');
 PERFORM pg_temp.retention_denied('retention-a',other,'request',note,'HUB_OBJECT_NOT_FOUND');
 PERFORM pg_temp.retention_denied('retention-rrhh',learner,'request',note,'HUB_ACCESS_DENIED');
 PERFORM pg_temp.retention_denied('retention-admin',learner,'request',note,'HUB_ACCESS_DENIED');
 PERFORM pg_temp.retention_denied('retention-learner',learner,'request',note,'HUB_ACCESS_DENIED');
 BEGIN PERFORM public.hub_coaching_retention_preview('retention-admin',learner);RAISE EXCEPTION 'Admin read private retention';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 BEGIN PERFORM public.hub_coaching_retention_preview('retention-learner',learner);RAISE EXCEPTION 'Learner read private retention';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_ACCESS_DENIED' THEN RAISE;END IF;END;
 preview:=public.hub_coaching_retention_preview('retention-rrhh',learner);
 IF preview::text LIKE '%PRIVATE_DISPOSAL_TEXT%' THEN RAISE EXCEPTION 'Retention preview exposed coaching body';END IF;

 request:=public.hub_coaching_retention_command('retention-a',learner,'request',note,'Two-year closed coaching review','retention-request');
 replay:=public.hub_coaching_retention_command('retention-a',learner,'request',note,'Two-year closed coaching review','retention-request');
 IF replay<>request THEN RAISE EXCEPTION 'Request retry changed its result';END IF;
 PERFORM pg_temp.retention_denied('retention-a',learner,'approve',(request->>'id')::uuid,'HUB_SEPARATE_APPROVER_REQUIRED');
 BEGIN DELETE FROM public.hub_coaching_note_revisions WHERE note_id=note;RAISE EXCEPTION 'Ordinary delete bypassed immutable guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_HISTORY_IMMUTABLE' THEN RAISE;END IF;END;
 PERFORM set_config('trez.coaching_disposal',request->>'id',TRUE);
 BEGIN DELETE FROM public.hub_coaching_notes WHERE id=note;RAISE EXCEPTION 'Forged setting bypassed pending request';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_HISTORY_IMMUTABLE' THEN RAISE;END IF;END;
 PERFORM set_config('trez.coaching_disposal','',TRUE);
 hold:=public.hub_coaching_retention_command('retention-b',learner,'hold',NULL,'Keep the learner case for active review','retention-hold');
 replay:=public.hub_coaching_retention_command('retention-b',learner,'hold',NULL,'Keep the learner case for active review','retention-hold');IF replay<>hold THEN RAISE EXCEPTION 'Hold retry not exact';END IF;
 PERFORM pg_temp.retention_denied('retention-b',learner,'approve',(request->>'id')::uuid,'HUB_RETENTION_PROTECTED');
 PERFORM public.hub_coaching_retention_command('retention-a',learner,'release',(hold->>'id')::uuid,'Review completed and hold may be released','retention-release');
 approval:=public.hub_coaching_retention_command('retention-b',learner,'approve',(request->>'id')::uuid,'Independently checked age and linked evidence','retention-approve');
 IF approval->>'status'<>'disposed' OR (approval->>'disposed_revisions')::integer<>1 THEN RAISE EXCEPTION 'Disposal did not remove exact note revisions';END IF;
 replay:=public.hub_coaching_retention_command('retention-b',learner,'approve',(request->>'id')::uuid,'Independently checked age and linked evidence','retention-approve');IF replay<>approval THEN RAISE EXCEPTION 'Approval retry not exact';END IF;
 IF EXISTS(SELECT 1 FROM public.hub_coaching_notes WHERE id=note) OR EXISTS(SELECT 1 FROM public.hub_coaching_note_revisions WHERE note_id=note) THEN RAISE EXCEPTION 'Disposed text remains';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hub_coaching_notes WHERE id=unrelated) OR NOT EXISTS(SELECT 1 FROM public.hub_attempts WHERE id=attempt) THEN RAISE EXCEPTION 'Disposal changed unrelated notes or evidence';END IF;
 BEGIN PERFORM public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'PRIVATE_DISPOSAL_TEXT','closed',NULL,'retention-original');RAISE EXCEPTION 'Old create retry resurrected disposed text';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_COACHING_DISPOSED' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.hub_coaching_retention_events e WHERE to_jsonb(e)::text LIKE '%PRIVATE_DISPOSAL_TEXT%') OR
   EXISTS(SELECT 1 FROM public.hub_idempotency_keys k WHERE action_code='coaching_retention' AND k.response::text LIKE '%PRIVATE_DISPOSAL_TEXT%') THEN RAISE EXCEPTION 'Disposal receipt kept note text';END IF;
 BEGIN DELETE FROM public.hub_coaching_retention_events WHERE learner_id=learner;RAISE EXCEPTION 'Audit history mutable';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '% is append-only' THEN RAISE;END IF;END;

 stale:=(public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'Stale preview original','closed',NULL,'retention-stale-origin')->'note'->>'id')::uuid;PERFORM pg_temp.age_coaching(stale);
 second:=public.hub_coaching_retention_command('retention-a',learner,'request',stale,'Review eligible old note','retention-stale-request');
 PERFORM public.hub_save_coaching_note('retention-a',learner,stale,NULL,1,'New revision after request','closed',NULL,'retention-stale-revision');
 PERFORM pg_temp.retention_denied('retention-b',learner,'approve',(second->>'id')::uuid,'HUB_RETENTION_PROTECTED');
 PERFORM pg_temp.age_coaching(stale);
 PERFORM pg_temp.retention_denied('retention-b',learner,'approve',(second->>'id')::uuid,'HUB_RETENTION_STATE_CONFLICT');
 PERFORM public.hub_coaching_retention_command('retention-a',learner,'cancel',(second->>'id')::uuid,'New revision requires a new review','retention-cancel');
 IF NOT EXISTS(SELECT 1 FROM public.hub_coaching_notes WHERE id=stale) THEN RAISE EXCEPTION 'Cancellation deleted a note';END IF;
 FOR i IN 1..51 LOOP PERFORM public.hub_save_coaching_note('retention-a',learner,NULL,NULL,0,'Paged protected note','closed',NULL,'retention-page-'||i);END LOOP;
 preview:=public.hub_coaching_retention_preview('retention-a',learner);
 IF jsonb_array_length(preview->'notes')<>50 OR preview->>'nextCursor' IS NULL THEN RAISE EXCEPTION 'Retention preview paging missing';END IF;
 replay:=public.hub_coaching_retention_preview('retention-a',learner,(preview->>'nextCursor')::uuid);
 IF jsonb_array_length(replay->'notes')=0 THEN RAISE EXCEPTION 'Retention next page empty';END IF;
 IF has_table_privilege('authenticated','public.hub_coaching_disposal_requests','UPDATE') OR
    has_table_privilege('service_role','public.hub_coaching_notes','DELETE') OR
    has_table_privilege('anon','public.hub_coaching_retention_deadlines','SELECT') OR
    has_function_privilege('authenticated','public.hub_coaching_retention_command(text,uuid,text,uuid,text,text)','EXECUTE') OR
    has_function_privilege('service_role','public.hub_save_coaching_note_original(text,uuid,uuid,uuid,integer,text,text,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Private retention boundary grants unsafe access';END IF;
END; $$;
ROLLBACK;
