BEGIN;
DO $$
DECLARE v_admin_a UUID:=gen_random_uuid();v_admin_b UUID:=gen_random_uuid();v_learner UUID:=gen_random_uuid();v_trainer UUID:=gen_random_uuid();
 v_course UUID:=gen_random_uuid();v_module UUID:=gen_random_uuid();v_activity UUID:=gen_random_uuid();v_en JSONB;v_es JSONB;v_next JSONB;v_next_es JSONB;
 v_start JSONB;v_captured JSONB;v_current JSONB;v_question JSONB;v_map JSONB;
BEGIN
 INSERT INTO hub_identities(id,external_subject_reference) VALUES(v_admin_a,'bilingual-admin-a'),(v_admin_b,'bilingual-admin-b'),(v_learner,'bilingual-learner'),(v_trainer,'bilingual-trainer');
 INSERT INTO hub_role_assignments(identity_id,role_id) SELECT i.id,r.id FROM hub_identities i CROSS JOIN hub_roles r WHERE
 (i.id IN(v_admin_a,v_admin_b) AND r.code='admin') OR(i.id=v_learner AND r.code='postulante') OR(i.id=v_trainer AND r.code='trainer');
 INSERT INTO hub_courses(id,stable_code,title) VALUES(v_course,'bilingual-fixture','Bilingual fixture');
 INSERT INTO hub_modules(id,course_id,stable_code,title,position) VALUES(v_module,v_course,'lesson','Lesson',1);
 INSERT INTO hub_activities(id,module_id,stable_code,title,activity_type,position) VALUES(v_activity,v_module,'read','Original','article',1);
 INSERT INTO hub_enrolments(identity_id,course_id) VALUES(v_learner,v_course);
 v_en:=hub_create_content_version('bilingual-admin-a','activity',v_activity,'en',
  '{"title":"Exact verification","instruction":{"paragraphs":["Verify the exact player."],"items":[{"id":"private-id","label":"Check the game."}]}}','New bilingual instructional fixture');
 IF 'private-id'=ANY(hub_instruction_texts(v_en->'content')) OR cardinality(hub_instruction_texts(v_en->'content'))<>3 THEN RAISE EXCEPTION 'identifiers entered translation contract';END IF;
 v_map:='{"Exact verification":"Verificación exacta","Verify the exact player.":"Verifique al jugador exacto.","Check the game.":"Revise el juego."}';
 BEGIN
  PERFORM hub_create_content_version('bilingual-admin-a','activity',v_activity,'es',jsonb_build_object('displayTranslation',jsonb_build_object(
   'sourceVersionId',v_en->>'id','sourceFingerprint',hub_instruction_source_hash(v_en->'content'),'es',v_map||'{"private-id":"Identificador"}'::jsonb)),'Identifier injection fixture');
  RAISE EXCEPTION 'identifier translation was accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_TRANSLATION_INVALID' THEN RAISE;END IF;END;
 v_es:=hub_create_content_version('bilingual-admin-a','activity',v_activity,'es',jsonb_build_object('displayTranslation',jsonb_build_object(
  'sourceVersionId',v_en->>'id','sourceFingerprint',hub_instruction_source_hash(v_en->'content'),'es',v_map)),'Spanish fixture counterpart');
 PERFORM hub_submit_content_version('bilingual-admin-a',(v_es->>'id')::uuid);
 BEGIN
  PERFORM hub_review_content_version('bilingual-admin-a',(v_es->>'id')::uuid,'approve','Self approval fixture');RAISE EXCEPTION 'Spanish self approval accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_SEPARATE_APPROVER_REQUIRED' THEN RAISE;END IF;END;
 PERFORM hub_review_content_version('bilingual-admin-b',(v_es->>'id')::uuid,'approve','Spanish reviewed independently');
 -- A draft source edit invalidates a previously reviewed companion.
 UPDATE hub_content_versions SET content=jsonb_set(content,'{title}','"Changed title"') WHERE id=(v_en->>'id')::uuid RETURNING to_jsonb(hub_content_versions.*) INTO v_en;
 PERFORM hub_submit_content_version('bilingual-admin-a',(v_en->>'id')::uuid);
 BEGIN
  PERFORM hub_review_content_version('bilingual-admin-b',(v_en->>'id')::uuid,'approve','Stale companion fixture');RAISE EXCEPTION 'stale source fingerprint accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_TRANSLATION_REQUIRED' THEN RAISE;END IF;END;
 v_map:=(v_map-'Exact verification')||'{"Changed title":"Título cambiado"}'::jsonb;
 v_es:=hub_create_content_version('bilingual-admin-a','activity',v_activity,'es',jsonb_build_object('displayTranslation',jsonb_build_object(
  'sourceVersionId',v_en->>'id','sourceFingerprint',hub_instruction_source_hash(v_en->'content'),'es',v_map)),'Updated Spanish source counterpart');
 PERFORM hub_submit_content_version('bilingual-admin-a',(v_es->>'id')::uuid);
 PERFORM hub_review_content_version('bilingual-admin-b',(v_es->>'id')::uuid,'approve','Updated Spanish reviewed');
 PERFORM hub_review_content_version('bilingual-admin-b',(v_en->>'id')::uuid,'approve','Matching bilingual source reviewed');
 v_current:=hub_current_instruction_translation(v_activity);
 IF v_current->'es'->>'Changed title'<>'Título cambiado' THEN RAISE EXCEPTION 'current Spanish counterpart missing';END IF;
 v_start:=hub_start_activity_attempt('bilingual-learner',v_activity,'{}','bilingual-start');
 SELECT definition_snapshot INTO v_captured FROM hub_activity_attempts WHERE id=(v_start->>'activityAttemptId')::uuid;
 IF v_captured->'displayTranslation' IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'Spanish counterpart not pinned';END IF;
 v_next:=hub_create_content_version('bilingual-admin-a','activity',v_activity,'en','{"title":"Next lesson","instruction":{"paragraphs":["Next source text."]}}','Next English source fixture');
 v_next_es:=hub_create_content_version('bilingual-admin-a','activity',v_activity,'es',jsonb_build_object('displayTranslation',jsonb_build_object(
  'sourceVersionId',v_next->>'id','sourceFingerprint',hub_instruction_source_hash(v_next->'content'),'es','{"Next lesson":"Lección siguiente","Next source text.":"Texto siguiente."}'::jsonb)),'Next Spanish counterpart');
 PERFORM hub_submit_content_version('bilingual-admin-a',(v_next_es->>'id')::uuid);
 PERFORM hub_review_content_version('bilingual-admin-b',(v_next_es->>'id')::uuid,'approve','Next Spanish reviewed first');
 IF hub_current_instruction_translation(v_activity) IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'preparing next Spanish version broke current delivery';END IF;
 PERFORM hub_submit_content_version('bilingual-admin-a',(v_next->>'id')::uuid);
 PERFORM hub_review_content_version('bilingual-admin-b',(v_next->>'id')::uuid,'approve','Next English reviewed');
 IF hub_current_instruction_translation(v_activity)->'es'->>'Next lesson'<>'Lección siguiente' THEN RAISE EXCEPTION 'new source counterpart missing';END IF;
 IF (SELECT definition_snapshot FROM hub_activity_attempts WHERE id=(v_start->>'activityAttemptId')::uuid) IS DISTINCT FROM v_captured THEN RAISE EXCEPTION 'historical bilingual snapshot changed';END IF;
 v_question:=hub_publish_bilingual_theory_question('bilingual-trainer','bilingual-exact',0,'Which exact player is required?',
  '[{"id":"exact","label":"The verified player"},{"id":"similar","label":"A similar name"}]','exact','Existing exact-player source','Bilingual question fixture',
  '{"question":"¿Qué jugador exacto se requiere?","choices":{"exact":"El jugador verificado","similar":"Un nombre parecido"}}');
 IF v_question->>'correct_option'<>'exact' OR v_question->'display_es'->'choices'->>'exact'<>'El jugador verificado' THEN RAISE EXCEPTION 'question ID parity lost';END IF;
 BEGIN
  PERFORM hub_publish_bilingual_theory_question('bilingual-trainer','bilingual-invalid',0,'Which exact player is required?',
   '[{"id":"exact","label":"The verified player"},{"id":"similar","label":"A similar name"}]','exact','Existing exact-player source','Invalid Spanish ID fixture',
   '{"question":"¿Qué jugador exacto se requiere?","choices":{"wrong":"Incorrecto","similar":"Parecido"}}');
  RAISE EXCEPTION 'mismatched Spanish choice IDs accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_TRANSLATION_INVALID' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','hub_instruction_translations(uuid[])','EXECUTE')
  OR has_function_privilege('anon','hub_runtime_question_translations(text,uuid)','EXECUTE')
  OR has_function_privilege('service_role','hub_publish_theory_question(text,text,integer,text,jsonb,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'public translation read or obsolete publisher exposed';END IF;
END;$$;
ROLLBACK;
