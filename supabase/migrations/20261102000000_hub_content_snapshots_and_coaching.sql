-- Editable instruction, immutable attempt content, and private trainer coaching.
-- Business-policy/adapter fields cannot be changed by the instructional editor.
ALTER TABLE public.hub_activity_attempts ADD COLUMN definition_snapshot JSONB;

CREATE FUNCTION public.hub_pin_activity_definition() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.definition_snapshot IS DISTINCT FROM OLD.definition_snapshot THEN
      RAISE EXCEPTION 'HUB_SNAPSHOT_IMMUTABLE';
    END IF;
  ELSE
    SELECT jsonb_build_object('title', a.title, 'content', a.content,
      'type', a.activity_type, 'capturedAt', now(),
      'contentVersionId', (SELECT v.id FROM public.hub_content_versions v
        WHERE v.definition_kind = 'activity' AND v.definition_id = a.id
        AND v.locale = 'en' AND v.status = 'published'))
    INTO NEW.definition_snapshot FROM public.hub_activities a WHERE a.id = NEW.activity_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_activity_definition_snapshot BEFORE INSERT OR UPDATE
ON public.hub_activity_attempts FOR EACH ROW EXECUTE FUNCTION public.hub_pin_activity_definition();

-- Only allow instruction fields; execution configuration is a separate policy boundary.
CREATE FUNCTION public.hub_validate_instruction_version() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND
    (NEW.content IS DISTINCT FROM OLD.content OR NEW.definition_id <> OLD.definition_id
     OR NEW.definition_kind <> OLD.definition_kind OR NEW.locale <> OLD.locale
     OR NEW.author_identity_id <> OLD.author_identity_id OR NEW.version_number <> OLD.version_number
     OR NEW.change_rationale <> OLD.change_rationale) THEN
    RAISE EXCEPTION 'HUB_PUBLISHED_CONTENT_IMMUTABLE';
  END IF;
  IF NEW.content ? 'instruction' THEN
    IF NEW.definition_kind <> 'activity' OR NEW.locale <> 'en'
       OR jsonb_typeof(NEW.content->'instruction') <> 'object'
       OR NEW.content->>'title' IS NULL OR length(btrim(NEW.content->>'title')) NOT BETWEEN 1 AND 200
       OR octet_length(NEW.content::text) > 65536
       OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.content->'instruction') k
         WHERE k NOT IN ('summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement')) THEN
      RAISE EXCEPTION 'HUB_INVALID_INSTRUCTION';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_instruction_version_guard BEFORE INSERT OR UPDATE ON public.hub_content_versions
FOR EACH ROW EXECUTE FUNCTION public.hub_validate_instruction_version();

CREATE FUNCTION public.hub_apply_published_instruction() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status <> 'published' AND NEW.content ? 'instruction' THEN
    UPDATE public.hub_activities SET title = NEW.content->>'title',
      content = (content - ARRAY['summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement']) || (NEW.content->'instruction'),
      updated_at = now() WHERE id = NEW.definition_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_apply_instruction AFTER UPDATE ON public.hub_content_versions
FOR EACH ROW EXECUTE FUNCTION public.hub_apply_published_instruction();

CREATE TABLE public.hub_coaching_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  attempt_id UUID REFERENCES public.hub_attempts(id) ON DELETE RESTRICT,
  created_by_identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 years'
);
CREATE TABLE public.hub_coaching_note_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.hub_coaching_notes(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision > 0),
  author_identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL CHECK(status IN ('open','practice_assigned','verified','closed')),
  verification_attempt_id UUID REFERENCES public.hub_attempts(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(note_id, revision), UNIQUE(author_identity_id, idempotency_key),
  CHECK(status <> 'verified' OR verification_attempt_id IS NOT NULL)
);
CREATE INDEX hub_coaching_learner_idx ON public.hub_coaching_notes(learner_identity_id,id);
CREATE TRIGGER hub_coaching_notes_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_notes
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE TRIGGER hub_coaching_revisions_immutable BEFORE UPDATE OR DELETE ON public.hub_coaching_note_revisions
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE FUNCTION public.hub_save_coaching_note(p_external_subject TEXT, p_learner_id UUID,
  p_note_id UUID, p_attempt_id UUID, p_expected_revision INTEGER, p_body TEXT,
  p_status TEXT, p_verification_attempt_id UUID, p_idempotency_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_actor UUID; v_note public.hub_coaching_notes%ROWTYPE;
  v_revision public.hub_coaching_note_revisions%ROWTYPE; v_latest INTEGER;
BEGIN
  v_actor := public.hub_require_active_role(p_external_subject, ARRAY['trainer']);
  IF p_learner_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 4000
     OR p_status IS NULL OR p_status NOT IN ('open','practice_assigned','verified','closed')
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'HUB_INVALID_INPUT';
  END IF;
  -- Serialize a writer's retry claims before allocating a note or revision.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || p_idempotency_key, 0));
  SELECT * INTO v_revision FROM public.hub_coaching_note_revisions
    WHERE author_identity_id = v_actor AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_note FROM public.hub_coaching_notes WHERE id = v_revision.note_id;
    IF v_note.learner_identity_id <> p_learner_id OR v_note.attempt_id IS DISTINCT FROM p_attempt_id
       OR (p_note_id IS NOT NULL AND p_note_id <> v_note.id)
       OR v_revision.revision <> p_expected_revision + 1 OR v_revision.body <> btrim(p_body)
       OR v_revision.status <> p_status
       OR v_revision.verification_attempt_id IS DISTINCT FROM p_verification_attempt_id THEN
      RAISE EXCEPTION 'HUB_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('note',to_jsonb(v_note),'revision',to_jsonb(v_revision));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hub_identities i JOIN public.hub_role_assignments a ON a.identity_id=i.id
      JOIN public.hub_roles r ON r.id=a.role_id WHERE i.id=p_learner_id AND r.code='postulante') THEN
    RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';
  END IF;
  IF p_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hub_attempts a
    JOIN public.hub_module_progress p ON p.id=a.module_progress_id
    JOIN public.hub_enrolments e ON e.id=p.enrolment_id WHERE a.id=p_attempt_id AND e.identity_id=p_learner_id) THEN
    RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND';
  END IF;
  IF p_note_id IS NULL THEN
    IF p_expected_revision <> 0 THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT'; END IF;
    INSERT INTO public.hub_coaching_notes(learner_identity_id,attempt_id,created_by_identity_id)
      VALUES(p_learner_id,p_attempt_id,v_actor) RETURNING * INTO v_note;
  ELSE
    SELECT * INTO v_note FROM public.hub_coaching_notes WHERE id=p_note_id AND learner_identity_id=p_learner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'HUB_OBJECT_NOT_FOUND'; END IF;
    IF v_note.attempt_id IS DISTINCT FROM p_attempt_id THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT'; END IF;
  END IF;
  SELECT coalesce(max(revision),0) INTO v_latest FROM public.hub_coaching_note_revisions WHERE note_id=v_note.id;
  IF v_latest <> p_expected_revision THEN RAISE EXCEPTION 'HUB_REVISION_CONFLICT'; END IF;
  IF p_verification_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hub_attempts a
    JOIN public.hub_module_progress p ON p.id=a.module_progress_id
    JOIN public.hub_enrolments e ON e.id=p.enrolment_id
    WHERE a.id=p_verification_attempt_id AND e.identity_id=p_learner_id AND a.status='completed'
      AND a.completed_at > v_note.created_at AND a.id IS DISTINCT FROM v_note.attempt_id) THEN
    RAISE EXCEPTION 'HUB_VERIFICATION_EVIDENCE_REQUIRED';
  END IF;
  IF p_status='verified' AND p_verification_attempt_id IS NULL THEN RAISE EXCEPTION 'HUB_VERIFICATION_EVIDENCE_REQUIRED'; END IF;
  INSERT INTO public.hub_coaching_note_revisions(note_id,revision,author_identity_id,body,status,verification_attempt_id,idempotency_key)
    VALUES(v_note.id,v_latest+1,v_actor,btrim(p_body),p_status,p_verification_attempt_id,p_idempotency_key) RETURNING * INTO v_revision;
  RETURN jsonb_build_object('note',to_jsonb(v_note),'revision',to_jsonb(v_revision));
END; $$;

ALTER TABLE public.hub_coaching_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_coaching_note_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_coaching_notes,public.hub_coaching_note_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_coaching_notes,public.hub_coaching_note_revisions TO service_role;
REVOKE ALL ON FUNCTION public.hub_save_coaching_note(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_save_coaching_note(TEXT,UUID,UUID,UUID,INTEGER,TEXT,TEXT,UUID,TEXT) TO service_role;
