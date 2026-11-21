-- Badgram database foundation
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists display_name text;
create unique index if not exists profiles_phone_unique_idx
  on public.profiles(phone) where phone is not null;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);
create index if not exists conversation_members_user_idx
  on public.conversation_members(user_id, conversation_id);

-- SECURITY DEFINER helpers avoid recursive RLS policy evaluation.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_creator(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.created_by = auth.uid()
  );
$$;

create or replace function public.list_my_conversations()
returns table (
  id uuid,
  title text,
  is_group boolean,
  created_at timestamptz,
  last_message text,
  last_message_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.title,
    c.is_group,
    c.created_at,
    (select m.body from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc limit 1) as last_message,
    (select m.created_at from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc limit 1) as last_message_at
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where cm.user_id = auth.uid()
  order by coalesce(
    (select max(m.created_at) from public.messages m where m.conversation_id = c.id),
    c.created_at
  ) desc;
$$;

create or replace function public.find_profile_by_phone(p_phone text)
returns table (user_id uuid, display_name text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, coalesce(nullif(p.display_name, ''), p.phone)
  from public.profiles p
  where p.phone = p_phone
    and p.id <> auth.uid()
  limit 1;
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.is_conversation_creator(uuid) from public;
revoke all on function public.list_my_conversations() from public;
revoke all on function public.find_profile_by_phone(text) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_creator(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
grant execute on function public.find_profile_by_phone(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Profiles readable by authenticated users" on public.profiles;
drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "Users create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members read conversations" on public.conversations;
drop policy if exists "Users create conversations" on public.conversations;
create policy "Members read conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy "Users create conversations" on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Members read membership" on public.conversation_members;
drop policy if exists "Creator or self adds membership" on public.conversation_members;
create policy "Members read membership" on public.conversation_members
  for select to authenticated using (
    user_id = auth.uid() or public.is_conversation_member(conversation_id)
  );
create policy "Creator or self adds membership" on public.conversation_members
  for insert to authenticated with check (
    user_id = auth.uid() or public.is_conversation_creator(conversation_id)
  );

drop policy if exists "Members read messages" on public.messages;
drop policy if exists "Members send own messages" on public.messages;
create policy "Members read messages" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "Members send own messages" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.is_conversation_member(conversation_id)
  );

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

-- Enable Realtime delivery for new messages. Safe to run repeatedly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
