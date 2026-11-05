SELECT (SELECT count(*) FROM public.hub_identities) AS identity_count,
 (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest_migration,
 to_regclass('public.hub_training_assignments') IS NULL AS assignment_table_absent,
 to_regclass('public.hub_training_assignment_events') IS NULL AS assignment_events_absent,
 to_regprocedure('public.hub_training_assignment_command(text,text,uuid,uuid,uuid,text,text,date,integer,uuid,text)') IS NULL AS command_absent,
 to_regprocedure('public.hub_list_training_assignments(text,uuid,uuid)') IS NULL AS read_function_absent,
 (SELECT encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]'),'sha256'),'hex') FROM public.hub_scored_evaluations e) AS formal_policy_hash;
