-- Use event time for game actions, including multiple actions in one transaction.
ALTER TABLE public.sandbox_game_history ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE public.hub_evaluation_action_evidence ADD COLUMN retention_until TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 years';

CREATE FUNCTION public.hub_initialize_customer_checkpoint() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.hub_scored_evaluations SET required_action_codes=ARRAY['CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','BACKEND_REFRESH_BALANCE','ADD_CREDITS','BACKEND_ADD_CREDITS','WITHDRAW_CREDITS','BACKEND_WITHDRAW_CREDITS','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD','RESOLVE_RECONCILIATION','CUSTOMER_RESPONSE'],
    practical_item_weights='{"CREATE_ACCOUNT":5,"BACKEND_CREATE_ACCOUNT":5,"SEARCH_USER":5,"VERIFY_BALANCE":5,"BACKEND_REFRESH_BALANCE":5,"ADD_CREDITS":5,"BACKEND_ADD_CREDITS":5,"WITHDRAW_CREDITS":5,"BACKEND_WITHDRAW_CREDITS":5,"RESET_PASSWORD_EDIT_INFORMATION":5,"BACKEND_RESET_PASSWORD":5,"RESOLVE_RECONCILIATION":5,"CUSTOMER_RESPONSE":20}'
  WHERE stable_code='checkpoint-movements-customer-experience' AND publication_status='draft' AND cardinality(required_action_codes)=0;
END; $$;
SELECT public.hub_initialize_customer_checkpoint();
REVOKE ALL ON FUNCTION public.hub_initialize_customer_checkpoint() FROM PUBLIC,anon,authenticated,service_role;
