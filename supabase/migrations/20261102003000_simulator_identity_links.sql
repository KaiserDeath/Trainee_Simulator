CREATE TABLE public.hub_simulator_sessions (
  session_id UUID PRIMARY KEY REFERENCES public.trainee_sessions(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hub_simulator_owner_idx ON public.hub_simulator_sessions(identity_id,session_id);
ALTER TABLE public.hub_simulator_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_simulator_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.hub_simulator_sessions TO service_role;
