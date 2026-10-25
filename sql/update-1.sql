-- Consul.ty update 1: new signup fields + in-app notifications

-- ---------- 1) Signup now sends last_name / first_name / middle_initial ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- hand-made users (profs/admins) have no first_name in their metadata, so they are skipped
  if new.raw_user_meta_data ? 'first_name' then
    insert into public.students (id, email, last_name, first_name, middle_initial)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'last_name', ''),
      coalesce(new.raw_user_meta_data->>'first_name', ''),
      nullif(new.raw_user_meta_data->>'middle_initial', '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- ---------- 2) Notifications table ----------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id bigint references public.consultations(id) on delete cascade,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "see own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin all notifications" on public.notifications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- users can only flip read_at; nobody creates notifications from the browser
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- internal helper, only triggers/functions below can call it
create function public.notify(p_user uuid, p_message text, p_link text, p_consultation bigint default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, consultation_id, message, link)
  values (p_user, p_consultation, p_message, p_link)
$$;
revoke all on function public.notify(uuid, text, text, bigint) from public, anon, authenticated;

-- ---------- 3) Triggers ----------
-- student submits a ticket -> professor is notified
create function public.notify_new_consultation() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_name text;
begin
  select trim(first_name || ' ' || last_name) into s_name from public.students where id = new.student_id;
  perform public.notify(
    new.professor_id,
    format('%s sent you a consultation (%s).', coalesce(nullif(s_name, ''), 'A student'), new.category),
    'prof-consultations.html?id=' || new.id,
    new.id
  );
  return new;
end $$;

create trigger consultation_created_notify
  after insert on public.consultations
  for each row execute function public.notify_new_consultation();

-- student books an on-site slot -> professor is notified
create function public.notify_new_schedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_name text;
begin
  select trim(first_name || ' ' || last_name) into s_name from public.students where id = new.student_id;
  perform public.notify(
    new.professor_id,
    format('%s booked %s, %s-%s.',
      coalesce(nullif(s_name, ''), 'A student'),
      to_char(new.date, 'MM/DD/YY'),
      to_char(new.start_time, 'FMHH12:MIam'),
      to_char(new.end_time, 'FMHH12:MIam')),
    'prof-schedules.html',
    new.consultation_id
  );
  return new;
end $$;

create trigger schedule_created_notify
  after insert on public.schedules
  for each row execute function public.notify_new_schedule();

-- professor replies -> student is notified
create or replace function public.professor_reply(p_ticket bigint, p_message text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.consultations;
  p_name text;
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

  select 'Prof. ' || trim(first_name || ' ' || last_name) into p_name
    from public.professors where id = auth.uid();

  perform public.notify(
    t.student_id,
    case p_status
      when 'solved'  then format('%s marked your consultation as Solved.', p_name)
      when 'on-site' then format('%s approved your consultation request. Pick a date and time.', p_name)
      else                format('%s replied to your consultation.', p_name)
    end,
    'my-tickets.html?id=' || p_ticket,
    p_ticket
  );
end $$;
