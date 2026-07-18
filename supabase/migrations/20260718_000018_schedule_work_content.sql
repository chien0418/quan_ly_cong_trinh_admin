alter table public.schedule_entries
  add column if not exists work_content text;

comment on column public.schedule_entries.work_content is '予定ごとの作業内容';
