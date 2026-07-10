-- Force soft-deleted purchase-order history to be hidden from all authenticated clients.
-- Restrictive SELECT policy is AND-ed with any permissive SELECT/ALL policies.

begin;

alter table public.purchase_orders enable row level security;

drop policy if exists purchase_orders_hide_deleted_restrictive
on public.purchase_orders;

create policy purchase_orders_hide_deleted_restrictive
on public.purchase_orders
as restrictive
for select
to authenticated
using (deleted_at is null);

commit;

-- Optional verification:
-- select policyname, permissive, roles, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'purchase_orders'
-- order by policyname;
