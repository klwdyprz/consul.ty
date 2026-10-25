-- Consul.ty: Supabase (Postgres) schema

-- ---------- Tables ----------
create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null
);

create table public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  student_number text unique,
  year_level text check (year_level in ('1st Year','2nd Year','3rd Year','4th Year','5th Year')),
  last_name text not null default '',
  first_name text not null default '',
  middle_initial text,
  suffix text,
  email text not null unique,
  phone_number text,
  program text,
  avatar_url text
);

create table public.professors (
  id uuid primary key references auth.users(id) on delete cascade,
  last_name text not null default '',
  first_name text not null default '',
  middle_initial text,
  suffix text,
  email text not null unique,
  department text,
  avatar_url text,
  available_days smallint[] not null default '{}',
  available_start time not null default '13:00',
  available_end time not null default '15:00'
);

create table public.consultations (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  subject_code text not null,
  section text not null,
  category text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending','solved','on-site')),
  created_at timestamptz not null default now()
);
create index on public.consultations (student_id);
create index on public.consultations (professor_id);

-- replaces the old longblob column: files go to Storage, rows just point to them
create table public.consultation_attachments (
  id bigint generated always as identity primary key,
  consultation_id bigint not null references public.consultations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id),
  file_name text not null,
  path text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table public.consultation_messages (
  id bigint generated always as identity primary key,
  consultation_id bigint not null references public.consultations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_role text not null check (sender_role in ('student','professor')),
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.consultation_messages (consultation_id);

create table public.schedules (
  id bigint generated always as identity primary key,
  consultation_id bigint not null unique references public.consultations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  unique (professor_id, date, start_time)
);

-- ---------- Helpers ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid())
$$;

-- Sign-up (create.html sends user_metadata.name) -> students row.
-- Users created by hand in the dashboard (profs/admins) have no "name", so they are skipped.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'name' then
    insert into public.students (id, email, first_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- only admins can change a student number
create function public.lock_student_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.student_number is distinct from old.student_number and not public.is_admin() then
    new.student_number := old.student_number;
  end if;
  return new;
end $$;

create trigger students_lock_number
  before update on public.students
  for each row execute function public.lock_student_number();

-- Professor reply: sets status + saves reply, once. Locked after that.
create function public.professor_reply(p_ticket bigint, p_message text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.consultations;
begin
  if p_status not in ('pending','solved','on-site') then
    raise exception 'invalid status';
  end if;

  select * into t from public.consultations
   where id = p_ticket and professor_id = auth.uid() for update;
  if not found then raise exception 'ticket not found'; end if;

  if t.status = 'solved' or exists (
    select 1 from public.consultation_messages
     where consultation_id = p_ticket and sender_role = 'professor'
  ) then
    raise exception 'ticket is locked';
  end if;

  insert into public.consultation_messages (consultation_id, sender_id, sender_role, body)
  values (p_ticket, auth.uid(), 'professor', p_message);

  update public.consultations set status = p_status where id = p_ticket;
end $$;

revoke all on function public.professor_reply(bigint, text, text) from public, anon;
grant execute on function public.professor_reply(bigint, text, text) to authenticated;

-- ---------- Row Level Security ----------
alter table public.admins                  enable row level security;
alter table public.students                enable row level security;
alter table public.professors              enable row level security;
alter table public.consultations           enable row level security;
alter table public.consultation_attachments enable row level security;
alter table public.consultation_messages   enable row level security;
alter table public.schedules               enable row level security;

create policy "admin reads self" on public.admins
  for select to authenticated using (id = auth.uid());

-- students
create policy "student reads self" on public.students
  for select to authenticated using (id = auth.uid());
create policy "prof reads own students" on public.students
  for select to authenticated using (
    exists (select 1 from public.consultations c
             where c.student_id = students.id and c.professor_id = auth.uid()));
create policy "student updates self" on public.students
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- professors
create policy "anyone signed in reads professors" on public.professors
  for select to authenticated using (true);
create policy "prof updates self" on public.professors
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- consultations
create policy "see own consultations" on public.consultations
  for select to authenticated using (student_id = auth.uid() or professor_id = auth.uid());
create policy "student creates consultation" on public.consultations
  for insert to authenticated with check (student_id = auth.uid() and status = 'pending');

-- messages
create policy "see messages" on public.consultation_messages
  for select to authenticated using (
    exists (select 1 from public.consultations c where c.id = consultation_id));
create policy "student sends message" on public.consultation_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and sender_role = 'student'
    and exists (select 1 from public.consultations c
                 where c.id = consultation_id and c.student_id = auth.uid()));

-- attachments
create policy "see attachments" on public.consultation_attachments
  for select to authenticated using (
    exists (select 1 from public.consultations c where c.id = consultation_id));
create policy "add attachments" on public.consultation_attachments
  for insert to authenticated with check (
    uploader_id = auth.uid()
    and exists (select 1 from public.consultations c where c.id = consultation_id));

-- schedule
create policy "see own schedules" on public.schedules
  for select to authenticated using (student_id = auth.uid() or professor_id = auth.uid());
create policy "student books slot" on public.schedules
  for insert to authenticated with check (
    student_id = auth.uid()
    and exists (select 1 from public.consultations c
                 where c.id = consultation_id
                   and c.student_id = auth.uid()
                   and c.professor_id = schedules.professor_id
                   and c.status = 'on-site'));

-- admin can do everything
do $$
declare t text;
begin
  foreach t in array array['admins','students','professors','consultations',
                           'consultation_attachments','consultation_messages','schedules']
  loop
    execute format(
      'create policy "admin all" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "avatars are public" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "upload own avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- attachment path = "<consultation_id>/<file>"
create policy "read ticket attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'attachments'
    and exists (select 1 from public.consultations c
                 where c.id::text = (storage.foldername(name))[1]));
create policy "upload ticket attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and exists (select 1 from public.consultations c
                 where c.id::text = (storage.foldername(name))[1]));

-- ---------- Creating professors / admins (do this by hand) ----------
-- 1) Dashboard > Authentication > Users > Add user (email + password, tick "Auto confirm").
-- 2) Copy that user's UID, then:
--
-- insert into public.professors (id, email, first_name, last_name, department)
-- values ('<uid>', 'prof@school.edu', 'Maria', 'Santos', 'College of Computer Studies');
--
-- insert into public.admins (id, username) values ('<uid>', 'admin');
