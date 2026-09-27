-- ============================================================================
-- 0013_admin_dashboard.sql — real sales + operations figures for the admin
-- dashboard, computed in SQL (PostgREST aggregates are disabled on Supabase).
-- SECURITY INVOKER: the caller's RLS applies, so non-admins read zero rows.
-- ============================================================================

-- Per-currency sales (never summed across currencies).
create or replace function public.admin_sales_summary(p_since timestamptz)
returns table (currency text, paid_orders bigint, gross bigint, refunded bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.currency,
         count(*)                         as paid_orders,
         coalesce(sum(o.total), 0)        as gross,
         coalesce(sum(o.amount_refunded), 0) as refunded
  from public.orders o
  where o.paid_at is not null
    and (p_since is null or o.paid_at >= p_since)
  group by o.currency
  order by o.currency;
$$;
revoke all on function public.admin_sales_summary(timestamptz) from public, anon;
grant execute on function public.admin_sales_summary(timestamptz) to authenticated;

-- Items that need a human. Each count is a real query over live state.
create or replace function public.admin_attention_counts()
returns table (
  manual_review_checkouts bigint,
  held_orders bigint,
  open_disputes bigint,
  failed_emails bigint,
  stuck_fulfillment bigint,
  dead_webhooks bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.checkout_attempts where state = 'manual_review'),
    (select count(distinct order_id) from public.fulfillment_entitlements where state = 'held'),
    (select count(*) from public.orders where dispute_state = 'open'),
    (select count(*) from public.delivery_messages where state in ('failed','dead','bounced','complained')),
    (select count(*) from public.orders where fulfillment_state = 'started' and paid_at < now() - interval '15 minutes'),
    (select count(*) from public.webhook_inbox where state = 'dead_letter');
$$;
revoke all on function public.admin_attention_counts() from public, anon;
grant execute on function public.admin_attention_counts() to authenticated;

-- Admin list of checkouts needing review (dashboard drill-down).
create index if not exists checkout_attempts_manual_review_idx
  on public.checkout_attempts (updated_at desc) where state = 'manual_review';
