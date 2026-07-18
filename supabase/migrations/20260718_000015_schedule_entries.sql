-- Web schedule management based on the weekly construction schedule sheet.
-- One record is reused by day, week, month and year views.

begin;

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  work_name text not null,
  assignee_name text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'on_hold')),
  color text not null default '#2563eb',
  note text,
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_entries_date_order check (end_date >= start_date)
);

create index if not exists idx_schedule_entries_range
on public.schedule_entries(start_date, end_date);

create index if not exists idx_schedule_entries_project
on public.schedule_entries(project_id);

drop trigger if exists trg_schedule_entries_updated_at on public.schedule_entries;
create trigger trg_schedule_entries_updated_at
before update on public.schedule_entries
for each row execute function public.set_updated_at();

alter table public.schedule_entries enable row level security;

drop policy if exists schedule_entries_read_active_employee on public.schedule_entries;
create policy schedule_entries_read_active_employee on public.schedule_entries
for select to authenticated
using (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
  )
);

drop policy if exists schedule_entries_insert_editor on public.schedule_entries;
create policy schedule_entries_insert_editor on public.schedule_entries
for insert to authenticated
with check (
  exists (
    select 1 from public.employees e
    where e.id = public.current_employee_id()
      and e.is_active = true
      and e.role in ('admin', 'editor')
  )
);

drop policy if exists schedule_entries_update_editor on public.schedule_entries;
create policy schedule_entries_update_editor on public.schedule_entries
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

drop policy if exists schedule_entries_delete_editor on public.schedule_entries;
create policy schedule_entries_delete_editor on public.schedule_entries
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
