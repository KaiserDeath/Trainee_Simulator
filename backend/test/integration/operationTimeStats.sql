DO $$
DECLARE v_first UUID:=gen_random_uuid();v_second UUID:=gen_random_uuid();v_customer UUID:=gen_random_uuid();
BEGIN
  IF has_function_privilege('anon','public.trainer_operation_time_stats()','EXECUTE')
    OR has_function_privilege('authenticated','public.trainer_operation_time_stats()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.trainer_operation_time_stats()','EXECUTE') THEN
    RAISE EXCEPTION 'Statistics RPC permission boundary failed';
  END IF;
  INSERT INTO public.trainee_sessions(id,trainee_name) VALUES(v_first,'Stats parity fixture'),(v_second,'Stats parity fixture');
  INSERT INTO public.sandbox_customers(id,session_id,username,balance) VALUES(v_customer,v_first,'stats_fixture',1000000);
  INSERT INTO public.sandbox_operations(id,session_id,customer_id,type,status,handling_time_seconds)
    SELECT gen_random_uuid(),v_first,v_customer,CASE WHEN n<=1000 THEN 'ADD CREDITS' ELSE 'WITHDRAW CREDITS' END,
      CASE WHEN n%2=0 THEN 'APPROVED' ELSE 'CANCELLED' END,CASE WHEN n<=1000 THEN 10 ELSE 20 END
    FROM generate_series(1,1503) n;
  INSERT INTO public.sandbox_customers(id,session_id,username,balance) VALUES(gen_random_uuid(),v_second,'stats_fixture_2',0) RETURNING id INTO v_customer;
  INSERT INTO public.sandbox_operations(session_id,customer_id,type,status,handling_time_seconds)
    SELECT v_second,v_customer,'REFRESH BALANCE','APPROVED',seconds
    FROM (VALUES(0::numeric),(2.675::numeric),(-1.005::numeric),(NULL::numeric),('NaN'::numeric),('Infinity'::numeric)) samples(seconds);
  INSERT INTO public.sandbox_operations(session_id,customer_id,type,status,handling_time_seconds)
    VALUES(v_second,v_customer,'','PENDING',0.005);
END; $$;

SELECT jsonb_build_object('summary',public.trainer_operation_time_stats(),'operations',
  coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'type',o.type,'handling_time_seconds',o.handling_time_seconds,
    'session',jsonb_build_object('id',s.id,'trainee_name',s.trainee_name,'started_at',s.started_at)) ORDER BY o.id)
    FROM public.sandbox_operations o LEFT JOIN public.trainee_sessions s ON s.id=o.session_id
    WHERE o.handling_time_seconds IS NOT NULL),'[]'::jsonb));
