// Canonical metadata/hash query; values never contain exported row bodies.
export function recoveryManifestSql(){return `
SET LOCAL search_path=public,extensions,pg_catalog;
CREATE TEMP TABLE recovery_rows(name TEXT PRIMARY KEY,rows BIGINT,digest TEXT);
DO $$ DECLARE item RECORD;n BIGINT;h TEXT;BEGIN
 FOR item IN SELECT n.nspname AS s,c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND n.nspname IN('public','auth','storage','supabase_migrations') LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(body,E''\\n'' ORDER BY body),'''')) FROM (SELECT to_jsonb(t)::text body FROM %I.%I t)s',item.s,item.t) INTO n,h;
  INSERT INTO recovery_rows VALUES(item.s||'.'||item.t,n,h);
 END LOOP;
END $$;
SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(to_jsonb(r) ORDER BY name) FROM recovery_rows r),
 'security',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'owner',pg_get_userbyid(c.relowner)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','v')),
 'views',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid,TRUE),'options',c.reloptions) ORDER BY c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname),'[]') FROM pg_policies p WHERE schemaname IN('public','storage')),
 'functions',(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||pg_get_userbyid(p.proowner),E'\n' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
 'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY schemaname,sequencename),'[]') FROM pg_sequences s WHERE schemaname IN('public','auth','storage'))
);`;
}
