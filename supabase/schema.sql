create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Profiles readable by authenticated users"
on public.profiles for select to authenticated using (true);

create policy "Users create own profile"
on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create policy "Members read conversations"
on public.conversations for select to authenticated
using (exists (
  select 1 from public.conversation_members cm
  where cm.conversation_id = id and cm.user_id = auth.uid()
));

create policy "Users create conversations"
on public.conversations for insert to authenticated
with check (created_by = auth.uid());

create policy "Members read membership"
on public.conversation_members for select to authenticated
using (user_id = auth.uid() or exists (
  select 1 from public.conversation_members mine
  where mine.conversation_id = conversation_id and mine.user_id = auth.uid()
));

create policy "Creator or self adds membership"
on public.conversation_members for insert to authenticated
with check (
  user_id = auth.uid() or exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = auth.uid()
  )
);

create policy "Members read messages"
on public.messages for select to authenticated
using (exists (
  select 1 from public.conversation_members cm
  where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
));

create policy "Members send own messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid() and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
  )
);
