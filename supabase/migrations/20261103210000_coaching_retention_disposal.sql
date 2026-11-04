-- Two-year private coaching disposal only. Assessment results, attempt budgets,
-- learning progress, simulator state and historical evidence are not deleted.
CREATE TABLE public.hub_coaching_retention_holds(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),learner_id UUID NOT NULL REFERENCES public.hub_identities(id),
 placed_by UUID NOT NULL REFERENCES public.hub_identities(id),reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),released_at TIMESTAMPTZ,
 released_by UUID REFERENCES public.hub_identities(id),release_reason TEXT,
 CHECK((released_at IS NULL AND released_by IS NULL AND release_reason IS NULL) OR
   (released_at IS NOT NULL AND released_by IS NOT NULL AND length(btrim(release_reason)) BETWEEN 5 AND 500))
);
CREATE UNIQUE INDEX hub_coaching_one_active_hold ON public.hub_coaching_retention_holds(learner_id) WHERE released_at IS NULL;
CREATE TABLE public.hub_coaching_disposal_requests(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),note_id UUID NOT NULL,learner_id UUID NOT NULL REFERENCES public.hub_identities(id),
 requested_by UUID NOT NULL REFERENCES public.hub_identities(id),reason TEXT NOT NULL,
 fingerprint TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','executing','disposed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),reviewed_by UUID REFERENCES public.hub_identities(id),
 review_reason TEXT,reviewed_at TIMESTAMPTZ,disposed_revisions INTEGER
);
CREATE UNIQUE INDEX hub_coaching_one_pending_disposal ON public.hub_coaching_disposal_requests(note_id) WHERE status IN('pending','executing');
CREATE TABLE public.hub_coaching_disposal_keys(
 author_id UUID NOT NULL REFERENCES public.hub_identities(id),key_hash TEXT NOT NULL,
 request_id UUID NOT NULL REFERENCES public.hub_coaching_disposal_requests(id),PRIMARY KEY(author_id,key_hash)
);
CREATE TABLE public.hub_coaching_retention_events(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),learner_id UUID NOT NULL REFERENCES public.hub_identities(id),
 actor_id UUID NOT NULL REFERENCES public.hub_identities(id),target_id UUID NOT NULL,
 event TEXT NOT NULL CHECK(event IN('hold','release','request','cancel','disposed')),reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER hub_coaching_retention_events_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_retention_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE TRIGGER hub_coaching_disposal_keys_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_disposal_keys
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE VIEW public.hub_coaching_retention_deadlines AS
SELECT n.id,greatest(n.retention_until,n.created_at+interval '2 years',max(r.created_at)+interval '2 years') AS retention_until
FROM public.hub_coaching_notes n LEFT JOIN public.hub_coaching_note_revisions r ON r.note_id=n.id GROUP BY n.id;
REVOKE ALL ON public.hub_coaching_retention_deadlines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_coaching_retention_deadlines TO service_role;
REVOKE ALL ON public.hub_coaching_notes,public.hub_coaching_note_revisions FROM service_role;
GRANT SELECT ON public.hub_coaching_notes,public.hub_coaching_note_revisions TO service_role;

CREATE FUNCTION public.hub_coaching_disposal_state(p_note_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n public.hub_coaching_notes%ROWTYPE;r public.hub_coaching_note_revisions%ROWTYPE;due TIMESTAMPTZ;blocked TEXT[]:='{}';fingerprint TEXT;revision_count INTEGER;
BEGIN
 SELECT * INTO n FROM public.hub_coaching_notes WHERE id=p_note_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 SELECT * INTO r FROM public.hub_coaching_note_revisions WHERE note_id=n.id ORDER BY revision DESC LIMIT 1;
 SELECT retention_until INTO due FROM public.hub_coaching_retention_deadlines WHERE id=n.id;
 SELECT count(*) INTO revision_count FROM public.hub_coaching_note_revisions WHERE note_id=n.id;
 IF r.id IS NULL THEN blocked:=array_append(blocked,'missing_revision');END IF;
 IF coalesce(r.status,'') NOT IN('closed','verified') THEN blocked:=array_append(blocked,'open_coaching');END IF;
 IF due IS NULL OR due>now() THEN blocked:=array_append(blocked,'retention_not_elapsed');END IF;
 IF EXISTS(SELECT 1 FROM public.hub_coaching_retention_holds WHERE learner_id=n.learner_identity_id AND released_at IS NULL) THEN blocked:=array_append(blocked,'retention_hold');END IF;
 IF EXISTS(SELECT 1 FROM public.hub_attempts a WHERE
   (a.id=n.attempt_id OR a.id IN(SELECT verification_attempt_id FROM public.hub_coaching_note_revisions WHERE note_id=n.id)) AND
   (a.status<>'completed' OR a.completed_at IS NULL OR a.retention_until IS NULL OR greatest(a.retention_until,a.completed_at+interval '2 years')>now())) THEN blocked:=array_append(blocked,'linked_attempt_protected');END IF;
 fingerprint:=encode(extensions.digest(jsonb_build_object('note',n.id,'revision',r.revision,'count',revision_count,'due',due,'status',r.status,'attempt',n.attempt_id)::text,'sha256'),'hex');
 RETURN jsonb_build_object('noteId',n.id,'latestRevision',r.revision,'status',r.status,'retainUntil',due,'eligible',cardinality(blocked)=0,'blockers',to_jsonb(blocked),'fingerprint',fingerprint);
END; $$;

CREATE FUNCTION public.hub_coaching_retention_preview(p_external_subject TEXT,p_learner_id UUID,p_cursor UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rows JSONB;last_id UUID;has_more BOOLEAN;actor UUID;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer','rrhh']);
 IF NOT EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=p_learner_id AND r.code='postulante') THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(public.hub_coaching_disposal_state(id) ORDER BY id),'[]') INTO rows FROM
   (SELECT id FROM public.hub_coaching_notes WHERE learner_identity_id=p_learner_id AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT 50)x;
 last_id:=(rows->-1->>'noteId')::uuid;
 SELECT EXISTS(SELECT 1 FROM public.hub_coaching_notes WHERE learner_identity_id=p_learner_id AND id>last_id) INTO has_more;
 RETURN jsonb_build_object('viewerId',actor,'notes',rows,'nextCursor',CASE WHEN has_more THEN last_id ELSE NULL END,
   'holds',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM public.hub_coaching_retention_holds h WHERE learner_id=p_learner_id AND released_at IS NULL),
   'requests',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC,id),'[]') FROM public.hub_coaching_disposal_requests q WHERE learner_id=p_learner_id AND status='pending' AND note_id IN(SELECT (v->>'noteId')::uuid FROM jsonb_array_elements(rows)v)),
   'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY reviewed_at DESC,id),'[]') FROM (SELECT * FROM public.hub_coaching_disposal_requests WHERE learner_id=p_learner_id AND status IN('disposed','cancelled') ORDER BY reviewed_at DESC,id LIMIT 50)q),
   'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY created_at DESC,id),'[]') FROM (SELECT * FROM public.hub_coaching_retention_events WHERE learner_id=p_learner_id ORDER BY created_at DESC,id LIMIT 50)e));
END; $$;

-- Keep append-only behavior for every ordinary writer. Only a transaction in
-- the reviewed SECURITY DEFINER disposal command can remove its exact note.
CREATE FUNCTION public.hub_coaching_disposal_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE note UUID;request UUID;
BEGIN
 IF TG_OP='DELETE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.hub_coaching_retention_command(text,uuid,text,uuid,text,text)'::regprocedure)) THEN
   note:=CASE WHEN TG_TABLE_NAME='hub_coaching_notes' THEN (to_jsonb(OLD)->>'id')::uuid ELSE (to_jsonb(OLD)->>'note_id')::uuid END;
   request:=nullif(current_setting('trez.coaching_disposal',TRUE),'')::uuid;
   IF EXISTS(SELECT 1 FROM public.hub_coaching_disposal_requests WHERE id=request AND note_id=note AND status='executing') THEN RETURN OLD;END IF;
 END IF;
 RAISE EXCEPTION 'HUB_HISTORY_IMMUTABLE';
END; $$;
DROP TRIGGER hub_coaching_notes_immutable ON public.hub_coaching_notes;
DROP TRIGGER hub_coaching_revisions_immutable ON public.hub_coaching_note_revisions;
CREATE TRIGGER hub_coaching_notes_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_notes FOR EACH ROW EXECUTE FUNCTION public.hub_coaching_disposal_guard();
CREATE TRIGGER hub_coaching_revisions_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_note_revisions FOR EACH ROW EXECUTE FUNCTION public.hub_coaching_disposal_guard();

CREATE FUNCTION public.hub_coaching_retention_command(p_external_subject TEXT,p_learner_id UUID,p_command TEXT,p_target_id UUID,p_reason TEXT,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;claim public.hub_idempotency_keys%ROWTYPE;fingerprint TEXT;state JSONB;result JSONB;target UUID;
 request public.hub_coaching_disposal_requests%ROWTYPE;hold public.hub_coaching_retention_holds%ROWTYPE;removed INTEGER;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
 IF p_command IS NULL OR p_command NOT IN('hold','release','request','cancel','approve') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
   OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 OR (p_command<>'hold' AND p_target_id IS NULL) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hub_role_assignments a JOIN public.hub_roles r ON r.id=a.role_id WHERE a.identity_id=p_learner_id AND r.code='postulante') THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
 -- Shared with note revisions and hold changes: no approval/edit/hold race.
 PERFORM pg_advisory_xact_lock(hashtextextended('hub-coaching-retention:'||p_learner_id,0));
 fingerprint:=encode(extensions.digest(jsonb_build_object('learner',p_learner_id,'command',p_command,'target',p_target_id,'reason',btrim(p_reason))::text,'sha256'),'hex');
 INSERT INTO public.hub_idempotency_keys(identity_id,action_code,idempotency_key,request_fingerprint) VALUES(actor,'coaching_retention',p_idempotency_key,fingerprint) ON CONFLICT DO NOTHING;
 SELECT * INTO claim FROM public.hub_idempotency_keys WHERE identity_id=actor AND action_code='coaching_retention' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF claim.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';END IF;
 IF claim.response IS NOT NULL THEN RETURN claim.response;END IF;
 IF p_command='hold' THEN
   IF EXISTS(SELECT 1 FROM public.hub_coaching_retention_holds WHERE learner_id=p_learner_id AND released_at IS NULL) THEN RAISE EXCEPTION 'HUB_RETENTION_HOLD_EXISTS';END IF;
   INSERT INTO public.hub_coaching_retention_holds(learner_id,placed_by,reason) VALUES(p_learner_id,actor,btrim(p_reason)) RETURNING * INTO hold;target:=hold.id;result:=to_jsonb(hold);
 ELSIF p_command='release' THEN
   UPDATE public.hub_coaching_retention_holds SET released_at=clock_timestamp(),released_by=actor,release_reason=btrim(p_reason)
     WHERE id=p_target_id AND learner_id=p_learner_id AND released_at IS NULL RETURNING * INTO hold;
   IF NOT FOUND THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
   target:=hold.id;result:=to_jsonb(hold);
 ELSIF p_command='request' THEN
   IF NOT EXISTS(SELECT 1 FROM public.hub_coaching_notes WHERE id=p_target_id AND learner_identity_id=p_learner_id) THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   state:=public.hub_coaching_disposal_state(p_target_id);
   IF NOT(state->>'eligible')::boolean THEN RAISE EXCEPTION 'HUB_RETENTION_PROTECTED';END IF;
   IF EXISTS(SELECT 1 FROM public.hub_coaching_disposal_requests WHERE note_id=p_target_id AND status IN('pending','executing')) THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
   INSERT INTO public.hub_coaching_disposal_requests(note_id,learner_id,requested_by,reason,fingerprint)
     VALUES(p_target_id,p_learner_id,actor,btrim(p_reason),state->>'fingerprint') RETURNING * INTO request;target:=request.id;result:=to_jsonb(request);
 ELSE
   SELECT * INTO request FROM public.hub_coaching_disposal_requests WHERE id=p_target_id AND learner_id=p_learner_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';END IF;
   IF p_command='approve' AND request.requested_by=actor THEN RAISE EXCEPTION 'HUB_SEPARATE_APPROVER_REQUIRED';END IF;
   IF request.status='disposed' AND request.reviewed_by=actor AND p_command='approve' THEN result:=to_jsonb(request);
   ELSE
     IF request.status<>'pending' THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
     IF p_command='cancel' THEN
       UPDATE public.hub_coaching_disposal_requests SET status='cancelled',reviewed_by=actor,review_reason=btrim(p_reason),reviewed_at=clock_timestamp() WHERE id=request.id RETURNING * INTO request;
     ELSE
       state:=public.hub_coaching_disposal_state(request.note_id);
       IF NOT(state->>'eligible')::boolean THEN RAISE EXCEPTION 'HUB_RETENTION_PROTECTED';END IF;
       IF state->>'fingerprint'<>request.fingerprint THEN RAISE EXCEPTION 'HUB_RETENTION_STATE_CONFLICT';END IF;
       UPDATE public.hub_coaching_disposal_requests SET status='executing' WHERE id=request.id;
       PERFORM set_config('trez.coaching_disposal',request.id::text,TRUE);
       INSERT INTO public.hub_coaching_disposal_keys(author_id,key_hash,request_id)
         SELECT author_identity_id,encode(extensions.digest(author_identity_id::text||':'||idempotency_key,'sha256'),'hex'),request.id FROM public.hub_coaching_note_revisions WHERE note_id=request.note_id;
       DELETE FROM public.hub_coaching_note_revisions WHERE note_id=request.note_id;GET DIAGNOSTICS removed=ROW_COUNT;
       DELETE FROM public.hub_coaching_notes WHERE id=request.note_id;
       PERFORM set_config('trez.coaching_disposal','',TRUE);
       UPDATE public.hub_coaching_disposal_requests SET status='disposed',reviewed_by=actor,review_reason=btrim(p_reason),reviewed_at=clock_timestamp(),disposed_revisions=removed WHERE id=request.id RETURNING * INTO request;
     END IF;
     INSERT INTO public.hub_coaching_retention_events(learner_id,actor_id,target_id,event,reason)
       VALUES(p_learner_id,actor,request.id,CASE p_command WHEN 'approve' THEN 'disposed' ELSE 'cancel' END,btrim(p_reason));
     result:=to_jsonb(request);
   END IF;
 END IF;
 IF p_command IN('hold','release','request') THEN INSERT INTO public.hub_coaching_retention_events(learner_id,actor_id,target_id,event,reason) VALUES(p_learner_id,actor,target,p_command,btrim(p_reason));END IF;
 UPDATE public.hub_idempotency_keys SET response=result WHERE identity_id=actor AND action_code='coaching_retention' AND idempotency_key=p_idempotency_key;
 RETURN result;
END; $$;

-- Removing a revision must not turn an ancient create retry into a new note.
ALTER FUNCTION public.hub_save_coaching_note(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) RENAME TO hub_save_coaching_note_original;
REVOKE ALL ON FUNCTION public.hub_save_coaching_note_original(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.hub_save_coaching_note(p_external_subject TEXT,p_learner_id UUID,p_note_id UUID,p_attempt_id UUID,p_expected_revision INTEGER,p_body TEXT,p_status TEXT,p_verification_attempt_id UUID,p_idempotency_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;
BEGIN
 actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
 PERFORM pg_advisory_xact_lock(hashtextextended('hub-coaching-retention:'||p_learner_id,0));
 IF EXISTS(SELECT 1 FROM public.hub_coaching_disposal_keys WHERE author_id=actor AND key_hash=encode(extensions.digest(actor::text||':'||p_idempotency_key,'sha256'),'hex')) THEN RAISE EXCEPTION 'HUB_COACHING_DISPOSED';END IF;
 RETURN public.hub_save_coaching_note_original(p_external_subject,p_learner_id,p_note_id,p_attempt_id,p_expected_revision,p_body,p_status,p_verification_attempt_id,p_idempotency_key);
END; $$;
ALTER TABLE public.hub_coaching_retention_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_coaching_disposal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_coaching_disposal_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_coaching_retention_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_coaching_retention_holds,public.hub_coaching_disposal_requests,public.hub_coaching_disposal_keys,public.hub_coaching_retention_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hub_coaching_retention_holds,public.hub_coaching_disposal_requests,public.hub_coaching_disposal_keys,public.hub_coaching_retention_events TO service_role;
REVOKE ALL ON FUNCTION public.hub_coaching_disposal_state(UUID),public.hub_coaching_disposal_guard(),public.hub_coaching_retention_preview(TEXT,UUID,UUID),public.hub_coaching_retention_command(TEXT,UUID,TEXT,UUID,TEXT,TEXT),public.hub_save_coaching_note(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hub_coaching_disposal_state(UUID),public.hub_coaching_disposal_guard() FROM service_role;
GRANT EXECUTE ON FUNCTION public.hub_coaching_retention_preview(TEXT,UUID,UUID),public.hub_coaching_retention_command(TEXT,UUID,TEXT,UUID,TEXT,TEXT),public.hub_save_coaching_note(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) TO service_role;
