-- Make admin soft-delete of purchase-order history idempotent.
-- Repeating delete on an already-deleted/nonexistent history row becomes a safe no-op.

begin;

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
  v_deleted_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  v_employee_id := public.current_employee_id();

  select
    po.project_id,
    po.order_name,
    po.version_label,
    po.deleted_at
  into
    v_project_id,
    v_order_name,
    v_version_label,
    v_deleted_at
  from public.purchase_orders po
  where po.id = p_order_id;

  -- Safe no-op when the row no longer exists or was already soft-deleted.
  if not found or v_deleted_at is not null then
    return;
  end if;

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
    and deleted_at is null;

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
