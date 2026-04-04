do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'categories',
    'time_slots',
    'staff',
    'tasks',
    'logs',
    'temperature_logs',
    'app_settings'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I enable row level security', tbl);

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = tbl
          and policyname = 'allow_anon_all_' || tbl
      ) then
        execute format(
          'create policy %I on public.%I for all to anon using (true) with check (true)',
          'allow_anon_all_' || tbl,
          tbl
        );
      end if;

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = tbl
          and policyname = 'allow_authenticated_all_' || tbl
      ) then
        execute format(
          'create policy %I on public.%I for all to authenticated using (true) with check (true)',
          'allow_authenticated_all_' || tbl,
          tbl
        );
      end if;
    end if;
  end loop;
end $$;
