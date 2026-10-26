-- Consul.ty update 3: admin side (system announcement)
-- Admins already have full access to every other table via the "admin all" policies in schema.sql.

create table public.announcements (
  id int primary key default 1 check (id = 1),   -- single row
  body text not null default '',
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.announcements (id) values (1) on conflict do nothing;

alter table public.announcements enable row level security;

-- everyone signed in can read it (so student/prof dashboards can show it later)
create policy "read announcement" on public.announcements
  for select to authenticated using (true);

-- only admins can change it
create policy "admin all announcements" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
