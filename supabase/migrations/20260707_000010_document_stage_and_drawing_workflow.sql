-- Web project v10
-- 1) Documents already have workflow_step_id in the base schema.
-- 2) Add the same stage relation to drawing_files so each drawing can be tied to an 工程.

alter table public.drawing_files
  add column if not exists workflow_step_id uuid
  references public.workflow_steps(id)
  on delete set null;

create index if not exists idx_drawing_files_workflow_step
  on public.drawing_files(workflow_step_id)
  where is_deleted = false;

create index if not exists idx_documents_workflow_step
  on public.documents(workflow_step_id)
  where is_deleted = false;
