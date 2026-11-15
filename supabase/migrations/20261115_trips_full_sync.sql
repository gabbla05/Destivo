-- Destivo: pełne dane podróży w Supabase (lokalna baza SQLite to kopia na czas braku sieci).
-- Uruchomienie: Supabase -> SQL Editor -> wklej całość -> Run. Skrypt można uruchomić wielokrotnie.

-- 1. Kolumny na szczegóły transportu (godziny, stacje, bilety) i noclegu (adres, lista plików Sejfu)
alter table public.trips
  add column if not exists transport_data text,
  add column if not exists lodging_data text,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Automatyczna data ostatniej zmiany wiersza
create or replace function public.destivo_set_trips_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists destivo_trips_set_updated_at on public.trips;
create trigger destivo_trips_set_updated_at
  before update on public.trips
  for each row execute function public.destivo_set_trips_updated_at();

-- 3. Row Level Security: każdy użytkownik widzi i zmienia tylko swoje podróże.
--    Aplikacja zapisuje cały wiersz przez upsert, więc potrzebne są reguły insert i update.
alter table public.trips enable row level security;

drop policy if exists "destivo_trips_select_own" on public.trips;
create policy "destivo_trips_select_own" on public.trips
  for select to authenticated
  using ((select auth.uid())::text = user_id::text);

drop policy if exists "destivo_trips_insert_own" on public.trips;
create policy "destivo_trips_insert_own" on public.trips
  for insert to authenticated
  with check ((select auth.uid())::text = user_id::text);

drop policy if exists "destivo_trips_update_own" on public.trips;
create policy "destivo_trips_update_own" on public.trips
  for update to authenticated
  using ((select auth.uid())::text = user_id::text)
  with check ((select auth.uid())::text = user_id::text);

drop policy if exists "destivo_trips_delete_own" on public.trips;
create policy "destivo_trips_delete_own" on public.trips
  for delete to authenticated
  using ((select auth.uid())::text = user_id::text);

-- 4. Odświeżenie schematu w API (bez tego nowe kolumny bywają widoczne dopiero po chwili)
notify pgrst, 'reload schema';

-- 5. Kontrola: wszystkie reguły dostępu tabeli trips (powinny zostać tylko reguły "..._own"
--    albo inne ograniczone do auth.uid(); reguła z warunkiem "true" oznacza dostęp do cudzych podróży)
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'trips'
order by policyname;
