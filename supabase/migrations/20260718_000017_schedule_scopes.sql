-- Keep daily and yearly plans independent; weekly and monthly plans share data.

begin;

alter table public.schedule_entries
  add column if not exists schedule_scope text not null default 'week_month';

alter table public.schedule_entries
  drop constraint if exists schedule_entries_scope_check;

alter table public.schedule_entries
  add constraint schedule_entries_scope_check
  check (schedule_scope in ('day', 'week_month', 'year'));

create index if not exists idx_schedule_entries_scope_range
on public.schedule_entries(schedule_scope, start_date, end_date);

commit;
