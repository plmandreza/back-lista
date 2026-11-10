-- =============================================================================
-- Lista de Tarefas — script completo para o SQL Editor do Supabase
-- =============================================================================

-- 1) Tabela
create table if not exists public.tasks (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(trim(title)) > 0),
  description text,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) Atualiza updated_at automaticamente em todo UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- 3) Índice para ordenar por data de criação
create index if not exists idx_tasks_created_at on public.tasks (created_at desc);

-- 4) Permissões para a chave publishable (papel "anon")
grant select, insert, update, delete on public.tasks to anon, authenticated;
grant usage, select on sequence public.tasks_id_seq to anon, authenticated;

-- 5) Row Level Security + políticas de CRUD
alter table public.tasks enable row level security;

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks
  for select to anon, authenticated using (true);

create policy "tasks_insert" on public.tasks
  for insert to anon, authenticated with check (true);

create policy "tasks_update" on public.tasks
  for update to anon, authenticated using (true) with check (true);

create policy "tasks_delete" on public.tasks
  for delete to anon, authenticated using (true);

-- 6) (Opcional) Tarefas de exemplo
insert into public.tasks (title, description)
values
  ('Estudar Express', 'Revisar rotas e middlewares'),
  ('Configurar Supabase', 'Criar tabela e políticas de RLS'),
  ('Fazer deploy na Vercel', 'Subir o projeto pelo GitHub');
