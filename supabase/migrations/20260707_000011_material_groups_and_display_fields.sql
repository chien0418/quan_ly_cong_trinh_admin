-- 工事管理 Web v18
-- Material groups + per-item display field configuration.

create table if not exists public.material_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  note text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_name)
);

drop trigger if exists trg_material_groups_updated_at on public.material_groups;
create trigger trg_material_groups_updated_at
before update on public.material_groups
for each row execute function public.set_updated_at();

alter table public.material_items
  add column if not exists group_id uuid references public.material_groups(id) on delete set null,
  add column if not exists display_material boolean not null default true,
  add column if not exists display_item_name boolean not null default true,
  add column if not exists display_size boolean not null default true,
  add column if not exists display_unit boolean not null default true,
  add column if not exists display_note boolean not null default false;

create index if not exists idx_material_items_group_id
on public.material_items(group_id);

create index if not exists idx_material_groups_order
on public.material_groups(display_order, group_name);

alter table public.material_groups enable row level security;

drop policy if exists material_groups_read_authenticated on public.material_groups;
drop policy if exists material_groups_read_active_employee on public.material_groups;
create policy material_groups_read_active_employee on public.material_groups
for select to authenticated
using (public.current_employee_id() is not null and is_active = true);

drop policy if exists material_groups_admin_write on public.material_groups;
create policy material_groups_admin_write on public.material_groups
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
