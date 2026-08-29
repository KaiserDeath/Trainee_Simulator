-- Focused Hub practice contexts use the existing disposable sandbox tables but
-- never start the timed GameMaster session. The explicit links preserve Hub
-- attempt lineage without inferring identity from a trainee name.

CREATE TABLE public.hub_practice_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  activity_id UUID NOT NULL REFERENCES public.hub_activities(id) ON DELETE RESTRICT,
  activity_attempt_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  legacy_trainee_session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id) ON DELETE RESTRICT,
  game TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (activity_attempt_id),
  FOREIGN KEY (activity_attempt_id, attempt_id)
    REFERENCES public.hub_activity_attempts(id, attempt_id) ON DELETE RESTRICT,
  CHECK (length(btrim(game)) > 0)
);

CREATE INDEX hub_practice_contexts_identity_activity_idx
  ON public.hub_practice_contexts(identity_id, activity_id, created_at DESC);

REVOKE ALL ON public.hub_practice_contexts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hub_practice_contexts TO service_role;

COMMENT ON TABLE public.hub_practice_contexts IS
  'Explicit Hub activity-to-disposable-sandbox links for untimed focused practice.';
