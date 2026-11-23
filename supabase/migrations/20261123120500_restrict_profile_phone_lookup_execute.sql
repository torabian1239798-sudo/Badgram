revoke all on function public.find_profile_by_phone(text) from public;
revoke all on function public.find_profile_by_phone(text) from anon;
grant execute on function public.find_profile_by_phone(text) to authenticated;
