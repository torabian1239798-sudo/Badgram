alter table public.conversation_members
  add column if not exists role text not null default 'member';

update public.conversation_members cm
set role = case when c.created_by = cm.user_id then 'owner' else 'member' end
from public.conversations c
where c.id = cm.conversation_id;

alter table public.conversation_members
  drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check
  check (role in ('owner','admin','member'));

create or replace function private.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  );
$$;

revoke all on function private.is_conversation_admin(uuid) from public, anon;
grant execute on function private.is_conversation_admin(uuid) to authenticated;

create or replace function public.enforce_conversation_member_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_creator uuid;
begin
  if tg_op = 'INSERT' then
    select c.created_by into v_creator from public.conversations c where c.id = new.conversation_id;
    if new.user_id = v_creator then new.role := 'owner'; else new.role := 'member'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id
       or new.user_id is distinct from old.user_id
       or new.joined_at is distinct from old.joined_at then
      raise exception 'Membership identity fields are immutable' using errcode = '42501';
    end if;
    if old.role = 'owner' then
      if new.role <> 'owner' then raise exception 'Conversation owner cannot be demoted' using errcode = '42501'; end if;
    elsif not private.is_conversation_admin(old.conversation_id) then
      raise exception 'Only group admins can change member roles' using errcode = '42501';
    elsif new.role = 'owner' then
      raise exception 'Owner role is reserved for the conversation creator' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.role = 'owner' then raise exception 'Conversation owner cannot be removed' using errcode = '42501'; end if;
    if not private.is_conversation_admin(old.conversation_id) then
      raise exception 'Only group admins can remove members' using errcode = '42501';
    end if;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_conversation_member_roles() from public, anon, authenticated;
drop trigger if exists conversation_member_roles_guard on public.conversation_members;
create trigger conversation_member_roles_guard
before insert or update or delete on public.conversation_members
for each row execute function public.enforce_conversation_member_roles();

drop policy if exists "Admins update conversation memberships" on public.conversation_members;
create policy "Admins update conversation memberships" on public.conversation_members
for update to authenticated using (private.is_conversation_admin(conversation_id))
with check (private.is_conversation_admin(conversation_id));

drop policy if exists "Admins remove conversation memberships" on public.conversation_members;
create policy "Admins remove conversation memberships" on public.conversation_members
for delete to authenticated using (private.is_conversation_admin(conversation_id));

grant update, delete on public.conversation_members to authenticated;
