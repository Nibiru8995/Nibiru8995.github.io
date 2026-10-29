-- ============================================================
-- СТЕНА ТЬМЫ (v1.3.0) — простенькая таблица чата в главном меню
-- Выполнить в Supabase → SQL Editor (один раз).
-- Таблица wall_messages ХРАНИТ НЕ БОЛЕЕ 15 СООБЩЕНИЙ:
--   триггер wall_trim после каждой вставки удаляет всё старьё.
-- RLS: только INSERT и SELECT для anon — как у Таблички Тьмы.
-- ============================================================

create table if not exists public.wall_messages (
  id         bigint generated always as identity primary key,
  name       text        not null default 'Аноним',
  text       text        not null,
  created_at timestamptz not null default now()
);

alter table public.wall_messages enable row level security;

drop policy if exists "wall_read"  on public.wall_messages;
drop policy if exists "wall_insert" on public.wall_messages;

create policy "wall_read"
  on public.wall_messages for select to anon using (true);

create policy "wall_insert"
  on public.wall_messages for insert to anon
  with check (char_length(text) between 1 and 200 and char_length(name) <= 20);

-- Потолок в 15 сообщений: после каждой вставки подчищаем старьё
create or replace function public.trim_wall()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wall_messages
  where id not in (
    select id from public.wall_messages
    order by created_at desc, id desc
    limit 15
  );
  return null;
end;
$$;

drop trigger if exists wall_trim on public.wall_messages;
create trigger wall_trim
  after insert on public.wall_messages
  for each statement execute function public.trim_wall();
