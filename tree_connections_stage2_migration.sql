-- ============================================================================
-- Reparation Road — Tree connections stage 2: message notifications
-- Run after tree_connections_safeguards_migration.sql. Safe to re-run.
-- ============================================================================

-- A message from another researcher is a notification like any other, so it
-- reuses the forum's notification table rather than growing a second bell.
-- That means widening the type check, whose constraint name is looked up rather
-- than assumed — it differs depending on how the table was first created.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'forum_notifications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.forum_notifications drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.forum_notifications
  add column if not exists conversation_id uuid
    references public.tree_conversations (id) on delete cascade;

alter table public.forum_notifications
  add constraint forum_notifications_type_check
  check (type in ('reply', 'reaction', 'mention', 'vote', 'follow', 'message'));

create index if not exists forum_notifications_conversation_idx
  on public.forum_notifications (conversation_id)
  where conversation_id is not null;
