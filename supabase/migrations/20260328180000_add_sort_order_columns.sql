alter table if exists public.categories add column if not exists "sortOrder" integer not null default 0;
alter table if exists public.time_slots add column if not exists "sortOrder" integer not null default 0;
alter table if exists public.staff add column if not exists "sortOrder" integer not null default 0;
alter table if exists public.tasks add column if not exists "sortOrder" integer not null default 0;

with ranked as (
  select id, row_number() over (order by id) as rn
  from public.categories
)
update public.categories c
set "sortOrder" = ranked.rn
from ranked
where c.id = ranked.id and c."sortOrder" = 0;

with ranked as (
  select id, row_number() over (order by id) as rn
  from public.time_slots
)
update public.time_slots ts
set "sortOrder" = ranked.rn
from ranked
where ts.id = ranked.id and ts."sortOrder" = 0;

with ranked as (
  select id, row_number() over (order by id) as rn
  from public.staff
)
update public.staff s
set "sortOrder" = ranked.rn
from ranked
where s.id = ranked.id and s."sortOrder" = 0;

with ranked as (
  select id, row_number() over (order by id) as rn
  from public.tasks
)
update public.tasks t
set "sortOrder" = ranked.rn
from ranked
where t.id = ranked.id and t."sortOrder" = 0;
