alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;

create index if not exists messages_reply_to_message_id_idx
  on public.messages(reply_to_message_id);

create table if not exists public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_read_receipts enable row level security;

drop policy if exists "Members read message receipts" on public.message_read_receipts;
create policy "Members read message receipts"
  on public.message_read_receipts for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users create own read receipts" on public.message_read_receipts;
create policy "Users create own read receipts"
  on public.message_read_receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and private.is_conversation_member(m.conversation_id)
    )
  );

grant select, insert on public.message_read_receipts to authenticated;

drop policy if exists "Users update own messages" on public.messages;
create policy "Users update own messages"
  on public.messages for update to authenticated
  using (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  )
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  );

drop policy if exists "Users delete own messages" on public.messages;
create policy "Users delete own messages"
  on public.messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  );

grant update, delete on public.messages to authenticated;
