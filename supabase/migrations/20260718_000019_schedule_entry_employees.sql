begin;

create table if not exists public.schedule_entry_employees (
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  is_primary boolean not null default false,
  position smallint not null default 0,
  primary key (schedule_entry_id, employee_id)
);

create unique index if not exists idx_schedule_entry_employees_one_primary
on public.schedule_entry_employees(schedule_entry_id)
where is_primary = true;

create index if not exists idx_schedule_entry_employees_employee
on public.schedule_entry_employees(employee_id);

alter table public.schedule_entry_employees enable row level security;

create or replace function public.list_active_schedule_employees()
returns table (
  id uuid,
  employee_code text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.employee_code, e.display_name
  from public.employees e
  where e.is_active = true
    and exists (
      select 1
      from public.employees current_employee
      where current_employee.auth_user_id = auth.uid()
        and current_employee.is_active = true
    )
  order by e.employee_code;
$$;

revoke all on function public.list_active_schedule_employees() from public;
grant execute on function public.list_active_schedule_employees() to authenticated;

drop policy if exists schedule_entry_employees_read_active_employee on public.schedule_entry_employees;
create policy schedule_entry_employees_read_active_employee on public.schedule_entry_employees
for select to authenticated
using (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
  )
);

drop policy if exists schedule_entry_employees_insert_editor on public.schedule_entry_employees;
create policy schedule_entry_employees_insert_editor on public.schedule_entry_employees
for insert to authenticated
with check (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
      and e.role in ('admin', 'editor')
  )
);

drop policy if exists schedule_entry_employees_update_editor on public.schedule_entry_employees;
create policy schedule_entry_employees_update_editor on public.schedule_entry_employees
for update to authenticated
using (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
      and e.role in ('admin', 'editor')
  )
)
with check (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
      and e.role in ('admin', 'editor')
  )
);

drop policy if exists schedule_entry_employees_delete_editor on public.schedule_entry_employees;
create policy schedule_entry_employees_delete_editor on public.schedule_entry_employees
for delete to authenticated
using (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
      and e.role in ('admin', 'editor')
  )
);

commit;
