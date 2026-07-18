-- Add working hours for the 24-hour daily schedule view.

begin;

alter table public.schedule_entries
  add column if not exists start_time time not null default '08:00',
  add column if not exists end_time time not null default '17:00';

commit;
