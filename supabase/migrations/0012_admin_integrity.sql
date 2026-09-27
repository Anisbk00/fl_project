-- ============================================================================
-- 0012_admin_integrity.sql — admin data-safety + auditability.
-- ----------------------------------------------------------------------------
-- 1. Purchased deliverables can never be deleted: order/attempt/entitlement
--    rows now reference product_deliverables with ON DELETE RESTRICT.
--    (Deactivate instead; buyers keep their purchased version.)
-- 2. publish_product: every product needs a downloadable ZIP, including free
--    ones (all acquisitions go through the entitlement flow). Was price > 0.
-- 3. Audit triggers on catalog tables. The 0005 header promised "trusted
--    triggers" but none existed, so price edits, file uploads/removals and
--    rights changes left no trail. Actor = auth.uid(), never a form field.
-- ============================================================================

-- --- 1. Deliverable referential integrity -----------------------------------
alter table public.order_items
  add constraint order_items_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
alter table public.checkout_attempt_items
  add constraint attempt_items_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
alter table public.fulfillment_entitlements
  add constraint entitlements_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
create index if not exists order_items_deliverable_idx on public.order_items (deliverable_asset_id);
create index if not exists attempt_items_deliverable_idx on public.checkout_attempt_items (deliverable_asset_id);
create index if not exists entitlements_deliverable_idx on public.fulfillment_entitlements (deliverable_asset_id);

-- --- 2. Publish gate: ZIP always required -----------------------------------
create or replace function public.publish_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row        public.products;
  v_rights     public.product_rights;
  v_errors     jsonb := '[]'::jsonb;
  v_has_cover  boolean;
  v_has_zip    boolean;
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb;
    return;
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    return query select false::boolean, jsonb_build_array('not_found')::jsonb;
    return;
  end if;
  if v_row.row_version <> p_expected_version then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  select * into v_rights from public.product_rights where product_id = p_product_id;
  if v_row.rights_status not in ('original','licensed') then
    v_errors := v_errors || '"rights_not_cleared"'::jsonb;
  end if;
  if v_rights.reviewer_uid is null or v_rights.reviewed_at is null then
    v_errors := v_errors || '"rights_not_attested"'::jsonb;
  end if;
  if v_row.rights_status = 'licensed' and (v_rights.evidence_ref is null or v_rights.source_type is null) then
    v_errors := v_errors || '"licensed_evidence_missing"'::jsonb;
  end if;
  if v_rights.license_expires_at is not null and v_rights.license_expires_at < now() then
    v_errors := v_errors || '"license_expired"'::jsonb;
  end if;

  if coalesce(length(v_row.title),0) < 1 then v_errors := v_errors || '"title_missing"'::jsonb; end if;
  if coalesce(length(v_row.short_description),0) < 1 then v_errors := v_errors || '"summary_missing"'::jsonb; end if;
  if v_row.price < 0 then v_errors := v_errors || '"invalid_price"'::jsonb; end if;
  if v_row.price_currency is null or v_row.price_currency !~ '^[A-Z]{3}$' then v_errors := v_errors || '"invalid_currency"'::jsonb; end if;

  select exists (
    select 1 from public.product_media m
    where m.product_id = p_product_id and m.kind = 'cover_image' and m.validation_state in ('ready','active')
  ) into v_has_cover;
  if not v_has_cover then v_errors := v_errors || '"cover_missing"'::jsonb; end if;

  select exists (
    select 1 from public.product_deliverables d
    where d.product_id = p_product_id and d.active = true and d.validation_state in ('ready','active')
  ) into v_has_zip;
  if not v_has_zip then v_errors := v_errors || '"private_zip_missing"'::jsonb; end if;

  if exists (select 1 from public.upload_intents i where i.product_id = p_product_id and i.state = 'pending') then
    v_errors := v_errors || '"pending_uploads"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return query select false::boolean, v_errors;
    return;
  end if;

  update public.products
    set lifecycle = 'published', published_at = now(),
        row_version = row_version + 1, updated_at = now(), updated_by_id = auth.uid()
    where id = p_product_id and row_version = p_expected_version;
  if not found then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
    values (auth.uid(), 'product.publish', 'product', p_product_id,
            jsonb_build_object('lifecycle','published','row_version', v_row.row_version + 1));
  return query select true::boolean, '[]'::jsonb;
end;
$$;
revoke all on function public.publish_product(uuid,int) from public, anon, authenticated;
grant execute on function public.publish_product(uuid,int) to authenticated;

-- --- 3. Catalog audit triggers ----------------------------------------------
-- Records WHICH columns changed (names only), plus old/new price because
-- price changes are commercially significant. Never copies text bodies or
-- private rights evidence into the audit log.
create or replace function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb;
  v_entity uuid;
  v_ignore text[] := array['updated_at','row_version','search_vector','updated_by_id'];
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_changed
      from jsonb_object_keys(v_new) k
      where v_new->k is distinct from v_old->k and not (k = any (v_ignore));
    if jsonb_array_length(v_changed) = 0 then return new; end if;
  else
    v_changed := '[]'::jsonb;
  end if;

  v_entity := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid,
                       (v_new->>'product_id')::uuid, (v_old->>'product_id')::uuid);

  -- Lifecycle changes are already audited by the publish/archive RPCs.
  if tg_table_name = 'products' and tg_op = 'UPDATE' and v_changed <@ '["lifecycle","published_at"]'::jsonb then
    return new;
  end if;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields, context)
    values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_entity, v_changed,
      case when tg_table_name = 'products' and v_changed ? 'price'
           then jsonb_build_object('old_price', v_old->'price', 'new_price', v_new->'price', 'currency', v_new->'price_currency')
           when tg_table_name in ('product_deliverables','product_media')
           then jsonb_build_object('product_id', coalesce(v_new->'product_id', v_old->'product_id'))
      end);
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_catalog_change() from public, anon, authenticated;

drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_catalog_change();
drop trigger if exists deliverables_audit on public.product_deliverables;
create trigger deliverables_audit after insert or update or delete on public.product_deliverables
  for each row execute function public.audit_catalog_change();
drop trigger if exists media_audit on public.product_media;
create trigger media_audit after insert or update or delete on public.product_media
  for each row execute function public.audit_catalog_change();
drop trigger if exists rights_audit on public.product_rights;
create trigger rights_audit after insert or update or delete on public.product_rights
  for each row execute function public.audit_catalog_change();
