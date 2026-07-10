-- Admin-only soft delete for purchase order history.
-- Deleted versions are hidden by RLS but preserved in Supabase for audit/recovery.

begin;

alter table public.purchase_orders
  add column if not exists deleted_at timestamptz;

alter table public.purchase_orders
  add column if not exists deleted_by uuid
  references public.employees(id)
  on delete set null;

create index if not exists idx_purchase_orders_visible_history
on public.purchase_orders(project_id, order_date desc, created_at desc)
where deleted_at is null;

-- Replace the existing read policy so deleted history is invisible
-- to normal client queries on both Flutter and Web.
drop policy if exists purchase_orders_read_authenticated
on public.purchase_orders;

create policy purchase_orders_read_authenticated
on public.purchase_orders
for select to authenticated
using (deleted_at is null);

create or replace function public.admin_delete_purchase_order_history(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_employee_name text;
  v_project_id uuid;
  v_order_name text;
  v_version_label text;
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  v_employee_id := public.current_employee_id();

  select e.display_name
  into v_employee_name
  from public.employees e
  where e.id = v_employee_id;

  update public.purchase_orders
  set deleted_at = now(),
      deleted_by = v_employee_id,
      updated_by = v_employee_id,
      updated_at = now()
  where id = p_order_id
    and deleted_at is null
  returning project_id, order_name, version_label
  into v_project_id, v_order_name, v_version_label;

  if not found then
    raise exception 'purchase order history not found or already deleted';
  end if;

  insert into public.update_logs (
    project_id,
    target_table,
    target_id,
    action,
    field_name,
    old_value,
    new_value,
    actor_employee_id,
    actor_name_snapshot
  )
  values (
    v_project_id,
    'purchase_orders',
    p_order_id,
    'delete',
    'history_visibility',
    jsonb_build_object(
      'visible', true,
      'order_name', v_order_name,
      'version_label', v_version_label
    ),
    jsonb_build_object(
      'visible', false,
      'deleted_at', now()
    ),
    v_employee_id,
    v_employee_name
  );
end;
$$;

revoke all on function public.admin_delete_purchase_order_history(uuid)
from public;

grant execute on function public.admin_delete_purchase_order_history(uuid)
to authenticated;

commit;
