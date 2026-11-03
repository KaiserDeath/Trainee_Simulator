DO $$
DECLARE
  v_ready UUID := gen_random_uuid();
  v_leased UUID := gen_random_uuid();
  v_dead UUID := gen_random_uuid();
  v_finished UUID := gen_random_uuid();
BEGIN
  IF has_function_privilege('anon','public.hub_prepare_simulation_poll()','EXECUTE')
    OR has_function_privilege('authenticated','public.hub_prepare_simulation_poll()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.hub_prepare_simulation_poll()','EXECUTE') THEN
    RAISE EXCEPTION 'Next-wake RPC permission boundary failed';
  END IF;
  INSERT INTO public.trainee_sessions(id,trainee_name,runtime_mode)
  VALUES(v_ready,'Worker schedule fixture','free_simulator'),
    (v_leased,'Worker lease fixture','free_simulator'),
    (v_dead,'Worker dead fixture','free_simulator'),
    (v_finished,'Worker completed fixture','free_simulator');
  UPDATE public.hub_simulation_jobs SET next_run_at='2000-01-01T00:00:00Z',lease_until=NULL WHERE session_id=v_ready;
  UPDATE public.hub_simulation_jobs SET next_run_at='1999-01-01T00:00:00Z',lease_until='2001-01-01T00:00:00Z',status='running' WHERE session_id=v_leased;
  UPDATE public.hub_simulation_jobs SET next_run_at='1998-01-01T00:00:00Z',status='dead' WHERE session_id=v_dead;
  UPDATE public.trainee_sessions SET status='completed' WHERE id=v_finished;
  -- Even a stale ready job must not wake a completed session.
  UPDATE public.hub_simulation_jobs SET next_run_at='1997-01-01T00:00:00Z',status='ready' WHERE session_id=v_finished;
  IF public.hub_prepare_simulation_poll() IS DISTINCT FROM '2000-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Scheduler did not choose earliest ready job';
  END IF;
  UPDATE public.hub_simulation_jobs SET status='completed' WHERE session_id=v_ready;
  IF public.hub_prepare_simulation_poll() IS DISTINCT FROM '2001-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Scheduler did not respect outstanding lease';
  END IF;
  UPDATE public.hub_simulation_jobs SET lease_until='1998-01-01T00:00:00Z' WHERE session_id=v_leased;
  IF public.hub_prepare_simulation_poll() IS DISTINCT FROM '1999-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Expired worker lease must allow recovery';
  END IF;
  UPDATE public.hub_simulation_jobs SET deadline=now()-interval '1 second',status='dead' WHERE session_id=v_dead;
  PERFORM public.hub_prepare_simulation_poll();
  IF (SELECT status FROM public.trainee_sessions WHERE id=v_dead) <> 'completed' THEN
    RAISE EXCEPTION 'Deadline must close a session even when its generation job is dead';
  END IF;
END;
$$;
