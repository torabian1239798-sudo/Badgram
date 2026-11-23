drop policy if exists "Creator adds membership" on public.conversation_members;
create policy "Creators and admins add membership"
on public.conversation_members for insert to authenticated
with check (
  private.is_conversation_creator(conversation_id)
  or private.is_conversation_admin(conversation_id)
);