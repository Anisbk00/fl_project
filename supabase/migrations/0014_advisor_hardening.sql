-- ============================================================================
-- 0014_advisor_hardening.sql — Supabase security-advisor findings.
-- ----------------------------------------------------------------------------
-- 1. Pin search_path on trigger functions (defense against search_path
--    hijacking of unqualified references).
-- 2. rls_auto_enable() is Supabase's own event-trigger function; it is fired
--    by DDL, never via RPC, so browser roles need no EXECUTE on it.
-- ============================================================================
alter function public.touch_updated_at() set search_path = public;
alter function public.products_search_vector_tg() set search_path = public;
alter function public.audit_no_update_delete() set search_path = public;
alter function public.no_update_delete_finalized() set search_path = public;
alter function public.no_fulfillment_update_delete() set search_path = public;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
