-- REST-accessible PostgreSQL job contract avoids a second connection pool/service
-- for the 10-learner pilot. The queue technology remains replaceable at this boundary.
ALTER TABLE public.trainee_sessions ADD COLUMN runtime_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK(runtime_mode IN ('legacy','focused_practice','free_simulator'));
CREATE TABLE public.hub_simulation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),session_id UUID NOT NULL UNIQUE REFERENCES public.trainee_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','completed','dead')),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),deadline TIMESTAMPTZ NOT NULL,
  sequence_number INTEGER NOT NULL DEFAULT 1,failures INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,lease_until TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hub_simulation_jobs_due_idx ON public.hub_simulation_jobs(next_run_at) WHERE status IN ('ready','running');
CREATE FUNCTION public.hub_schedule_simulation() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.runtime_mode='free_simulator' AND NEW.status='active' THEN
    INSERT INTO public.hub_simulation_jobs(session_id,deadline) VALUES(NEW.id,NEW.started_at+make_interval(secs=>coalesce(NEW.duration_minutes,30)*60))
      ON CONFLICT(session_id) DO UPDATE SET deadline=EXCLUDED.deadline,updated_at=now();
  ELSIF NEW.status<>'active' THEN
    UPDATE public.hub_simulation_jobs SET status='completed',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE session_id=NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER hub_simulation_schedule AFTER INSERT OR UPDATE OF status,duration_minutes,runtime_mode ON public.trainee_sessions
FOR EACH ROW EXECUTE FUNCTION public.hub_schedule_simulation();
CREATE FUNCTION public.hub_claim_simulation_job() RETURNS SETOF public.hub_simulation_jobs
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.hub_simulation_jobs j SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds',updated_at=now()
  WHERE j.id=(SELECT candidate.id FROM public.hub_simulation_jobs candidate
    JOIN public.trainee_sessions s ON s.id=candidate.session_id AND s.status='active'
    WHERE candidate.status IN ('ready','running') AND candidate.next_run_at<=now()
      AND (candidate.lease_until IS NULL OR candidate.lease_until<now()) ORDER BY candidate.next_run_at,candidate.id FOR UPDATE OF candidate SKIP LOCKED LIMIT 1)
  RETURNING j.*;
$$;
CREATE FUNCTION public.hub_renew_simulation_job(p_job_id UUID,p_lease_token UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH renewed AS(UPDATE public.hub_simulation_jobs SET lease_until=now()+interval '30 seconds',updated_at=now()
    WHERE id=p_job_id AND lease_token=p_lease_token AND status='running' AND lease_until>now() RETURNING id)
  SELECT EXISTS(SELECT 1 FROM renewed);
$$;
CREATE FUNCTION public.hub_finish_simulation_job(p_job_id UUID,p_lease_token UUID,p_success BOOLEAN) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_job public.hub_simulation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.hub_simulation_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_job.deadline<=now() THEN
    UPDATE public.trainee_sessions SET status='completed',ended_at=now() WHERE id=v_job.session_id AND status='active';
  ELSE
    UPDATE public.hub_simulation_jobs SET status=CASE WHEN NOT p_success AND failures>=4 THEN 'dead' ELSE 'ready' END,
      failures=CASE WHEN p_success THEN 0 ELSE failures+1 END,
      sequence_number=sequence_number+CASE WHEN p_success THEN 1 ELSE 0 END,
      next_run_at=now()+CASE WHEN p_success THEN interval '30 seconds' ELSE interval '5 seconds'*least(12,power(2,failures)::integer) END,
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=v_job.id;
  END IF;
  RETURN TRUE;
END; $$;
CREATE FUNCTION public.create_fenced_sandbox_operation(p_job_id UUID,p_lease_token UUID,p_operation JSONB)
RETURNS public.sandbox_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_job public.hub_simulation_jobs%ROWTYPE;v_operation public.sandbox_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.hub_simulation_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='running'
    AND lease_until>now() AND deadline>now() AND session_id=(p_operation->>'session_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_WORKER_LEASE_LOST'; END IF;
  PERFORM 1 FROM public.trainee_sessions WHERE id=v_job.session_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_WORKER_LEASE_LOST'; END IF;
  PERFORM 1 FROM public.hub_simulation_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND status='running' AND lease_until>now() AND deadline>now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_WORKER_LEASE_LOST'; END IF;
  SELECT * INTO v_operation FROM public.create_reserved_sandbox_operation(p_operation);
  RETURN v_operation;
END; $$;
CREATE FUNCTION public.apply_sandbox_movement_scenario(p_operation_id UUID,p_scenario TEXT,p_bot_applied BOOLEAN) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_operation public.sandbox_operations%ROWTYPE;
BEGIN
  IF p_scenario IS NULL OR p_scenario NOT IN ('ALREADY_PROCESSED','PLAYER_IN_GAME','PENDING_RECONCILIATION') OR p_bot_applied IS NULL THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  SELECT * INTO v_operation FROM public.sandbox_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_operation.status<>'PENDING' THEN RETURN FALSE; END IF;
  IF v_operation.movement_scenario IS NOT NULL THEN RETURN TRUE; END IF;
  IF p_bot_applied THEN
    IF v_operation.type='ADD CREDITS' THEN
      PERFORM public.recharge_sandbox_game_account(v_operation.game_account_id,v_operation.amount,'System movement scenario');
    ELSIF v_operation.type='WITHDRAW CREDITS' THEN
      PERFORM public.redeem_sandbox_game_account(v_operation.game_account_id,v_operation.amount,'System movement scenario');
    ELSE RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  END IF;
  UPDATE public.sandbox_operations SET movement_scenario=p_scenario,bot_applied=p_bot_applied WHERE id=p_operation_id;
  RETURN TRUE;
END; $$;
ALTER TABLE public.hub_simulation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_simulation_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hub_simulation_jobs TO service_role;
REVOKE ALL ON FUNCTION public.hub_claim_simulation_job(),public.hub_renew_simulation_job(UUID,UUID),public.hub_finish_simulation_job(UUID,UUID,BOOLEAN),public.create_fenced_sandbox_operation(UUID,UUID,JSONB),public.apply_sandbox_movement_scenario(UUID,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_claim_simulation_job(),public.hub_renew_simulation_job(UUID,UUID),public.hub_finish_simulation_job(UUID,UUID,BOOLEAN),public.create_fenced_sandbox_operation(UUID,UUID,JSONB),public.apply_sandbox_movement_scenario(UUID,TEXT,BOOLEAN) TO service_role;
