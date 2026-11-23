create or replace function public.prevent_message_identity_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message identity fields are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_message_identity_changes() from public;
revoke all on function public.prevent_message_identity_changes() from anon, authenticated;

drop trigger if exists messages_identity_immutable on public.messages;
create trigger messages_identity_immutable
before update on public.messages
for each row execute function public.prevent_message_identity_changes();
