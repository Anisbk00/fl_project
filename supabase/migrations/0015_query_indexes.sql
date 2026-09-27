-- ============================================================================
-- 0015_query_indexes.sql — indexes for foreign keys the runtime filters on.
-- Each index has a named caller; unused-FK indexes are deliberately omitted.
-- ============================================================================

-- revoke_fulfillment() updates sessions by order_id on every refund/dispute.
create index if not exists download_sessions_order_idx on public.download_access_sessions (order_id);
-- Checkout loads attempts per cart; ON DELETE CASCADE from guest_carts scans it.
create index if not exists checkout_attempts_cart_idx on public.checkout_attempts (cart_id);
-- Archiving/deleting a product cascades into carts that contain it.
create index if not exists guest_cart_items_product_idx on public.guest_cart_items (product_id);

-- Evaluate auth.uid() once per query instead of once per row.
drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select" on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()));
